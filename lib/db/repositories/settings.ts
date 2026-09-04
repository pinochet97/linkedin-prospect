import { query, queryOne } from '@/lib/db/client';
import { buildUpdate } from '@/lib/db/sql';
import type { SettingsRow } from '@/lib/db/types';

const DEFAULTS: SettingsRow = {
  id: 1,
  my_name: '',
  my_company: '',
  my_role: '',
  what_i_do: '',
  target_audience: '',
  tone_of_voice: '',
  things_to_avoid: '',
  automation_paused: false,
  paused_reason: null,
  updated_at: new Date(0),
};

export async function getSettings(): Promise<SettingsRow> {
  const row = await queryOne<SettingsRow>('select * from settings where id = 1');
  return row ?? DEFAULTS;
}

export type SettingsPatch = Partial<Omit<SettingsRow, 'id' | 'updated_at'>>;

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  const statement = buildUpdate('settings', patch, { column: 'id', value: 1 });
  if (!statement) return;
  await query(statement.text, statement.values);
}

/** Kill switch global: impede qualquer nova ação de automação. */
export async function setAutomationPaused(paused: boolean, reason: string | null): Promise<void> {
  await updateSettings({ automation_paused: paused, paused_reason: paused ? reason : null });
}
