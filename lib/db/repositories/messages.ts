import { query, queryOne } from '@/lib/db/client';
import type { LeadMessageRow } from '@/lib/db/types';
import type { MessageKind } from '@/lib/engine/types';

export type OutboundKind = Exclude<MessageKind, 'inbound_reply'>;

export async function getMessage(enrollmentId: string, kind: MessageKind): Promise<LeadMessageRow | null> {
  return queryOne<LeadMessageRow>(
    'select * from lead_messages where campaign_lead_id = $1 and kind = $2 order by created_at desc limit 1',
    [enrollmentId, kind],
  );
}

export async function listMessages(enrollmentId: string): Promise<LeadMessageRow[]> {
  return query<LeadMessageRow>('select * from lead_messages where campaign_lead_id = $1 order by created_at asc', [
    enrollmentId,
  ]);
}

/**
 * Guarda a mensagem gerada pela IA. O índice único no banco garante uma única
 * mensagem de saída por tipo — reaproveitamos a existente em vez de gerar
 * (e pagar) de novo.
 */
export async function saveGeneratedMessage(
  enrollmentId: string,
  kind: OutboundKind,
  body: string,
): Promise<LeadMessageRow> {
  const rows = await query<LeadMessageRow>(
    `insert into lead_messages (campaign_lead_id, kind, body, generated_at)
     values ($1, $2, $3, now())
     on conflict (campaign_lead_id, kind) where kind <> 'inbound_reply'
     do update set body = case when lead_messages.sent_at is null then excluded.body else lead_messages.body end
     returning *`,
    [enrollmentId, kind, body],
  );
  return rows[0];
}

export async function markMessageSent(
  enrollmentId: string,
  kind: OutboundKind,
  options: { dryRun: boolean },
): Promise<void> {
  await query(
    `update lead_messages set sent_at = now(), dry_run = $3 where campaign_lead_id = $1 and kind = $2`,
    [enrollmentId, kind, options.dryRun],
  );
}

export async function recordInboundReply(enrollmentId: string, body: string, receivedAt: Date): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    `select id from lead_messages
      where campaign_lead_id = $1 and kind = 'inbound_reply' and body = $2`,
    [enrollmentId, body],
  );
  if (existing) return;
  await query(
    `insert into lead_messages (campaign_lead_id, kind, body, sent_at, created_at)
     values ($1, 'inbound_reply', $2, null, $3)`,
    [enrollmentId, body, receivedAt],
  );
}
