'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { updateSettings } from '@/lib/db/repositories/settings';

const schema = z.object({
  my_name: z.string().trim(),
  my_company: z.string().trim(),
  my_role: z.string().trim(),
  what_i_do: z.string().trim(),
  target_audience: z.string().trim(),
  tone_of_voice: z.string().trim(),
  things_to_avoid: z.string().trim(),
});

export type SettingsFormState = { error?: string; saved?: boolean };

export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireAuth();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Dados inválidos.' };

  await updateSettings(parsed.data);
  revalidatePath('/settings');
  return { saved: true };
}
