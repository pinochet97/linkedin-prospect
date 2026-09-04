'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import {
  createCampaign,
  getCampaign,
  replaceCampaignSteps,
  setCampaignStatus,
  setDiscoveryStatus,
  updateCampaign,
} from '@/lib/db/repositories/campaigns';
import { reprojectCampaign } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { DEFAULT_STEPS, type CampaignStepRow } from '@/lib/engine/sequence';
import type { CampaignStatus, StepType } from '@/lib/engine/types';

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value));

const campaignSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe um nome.'),
    search_query: optionalText,
    linkedin_search_url: optionalText,
    icp_description: z.string().trim(),
    qualification_threshold: z.coerce.number().int().min(0).max(100),
    connection_note_max_chars: z.coerce.number().int().min(50).max(300),
    daily_connection_limit: z.coerce.number().int().min(1).max(100),
    daily_message_limit: z.coerce.number().int().min(1).max(200),
    discovery_target: z.coerce.number().int().min(1).max(500),
  })
  .refine((value) => value.search_query || value.linkedin_search_url, {
    message: 'Informe uma busca ou uma URL de pesquisa do LinkedIn.',
    path: ['search_query'],
  })
  .refine((value) => !value.linkedin_search_url || /linkedin\.com/i.test(value.linkedin_search_url), {
    message: 'A URL precisa ser do LinkedIn.',
    path: ['linkedin_search_url'],
  });

function parseSteps(formData: FormData): CampaignStepRow[] {
  return DEFAULT_STEPS.map((step) => {
    const type = step.step_type as StepType;
    const delayRaw = formData.get(`step_${type}_delay`);
    const delay = delayRaw === null ? step.delay_hours : Number(delayRaw);
    return {
      step_type: type,
      step_order: step.step_order,
      delay_hours: Number.isFinite(delay) && delay >= 0 ? Math.round(delay) : step.delay_hours,
      // O convite é obrigatório: sem ele não existe caminho para a mensagem.
      enabled: type === 'connection_request' ? true : formData.get(`step_${type}_enabled`) === 'on',
    };
  });
}

export type FormState = { error?: string };

export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const id = await createCampaign(parsed.data, parseSteps(formData));
  await log({ action: 'campaign', status: 'info', campaignId: id, message: `Campanha "${parsed.data.name}" criada.` });
  revalidatePath('/campaigns');
  redirect(`/campaigns/${id}`);
}

export async function updateCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Campanha não encontrada.' };

  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  await updateCampaign(id, parsed.data);
  await replaceCampaignSteps(id, parseSteps(formData));
  // A sequência mudou: recalcula a próxima ação de todos os leads da campanha.
  await reprojectCampaign(id);

  revalidatePath(`/campaigns/${id}`);
  redirect(`/campaigns/${id}`);
}

export async function changeCampaignStatusAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as CampaignStatus;
  if (!id || !['draft', 'active', 'paused', 'archived'].includes(status)) return;

  const campaign = await getCampaign(id);
  if (!campaign) return;

  await setCampaignStatus(id, status);
  await log({
    action: 'campaign',
    status: 'info',
    campaignId: id,
    message: `Campanha "${campaign.name}" agora está ${status}.`,
  });

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${id}`);
}

/** Recoloca a descoberta na fila; quem executa é o worker. */
export async function runDiscoveryAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await setDiscoveryStatus(id, 'pending');
  await log({ action: 'discovery', status: 'info', campaignId: id, message: 'Descoberta reagendada manualmente.' });
  revalidatePath(`/campaigns/${id}`);
}
