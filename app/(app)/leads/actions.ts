'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { clearError, setInterest, stopSequence } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { INTEREST_STATUSES, type InterestStatus } from '@/lib/engine/types';

export async function stopLeadSequenceAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await stopSequence(id);
  await log({ action: 'sequence', status: 'info', enrollmentId: id, message: 'Sequência interrompida manualmente.' });
  revalidatePath(`/leads/${id}`);
}

export async function clearLeadErrorAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await clearError(id);
  await log({ action: 'sequence', status: 'info', enrollmentId: id, message: 'Erro limpo, lead reprocessado.' });
  revalidatePath(`/leads/${id}`);
}

export async function setInterestAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('interest') ?? '');
  if (!id) return;
  const interest = (INTEREST_STATUSES as readonly string[]).includes(raw) ? (raw as InterestStatus) : null;
  await setInterest(id, interest);
  revalidatePath('/inbox');
  revalidatePath(`/leads/${id}`);
}
