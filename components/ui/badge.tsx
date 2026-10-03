import { cn } from '@/lib/utils';
import type { LeadStatus } from '@/lib/engine/types';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}
      {...props}
    />
  );
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  discovered: 'Descoberto',
  qualified: 'Qualificado',
  rejected: 'Rejeitado',
  ready_for_connection: 'Pronto p/ convite',
  connection_requested: 'Convite enviado',
  waiting_connection: 'Aguardando aceite',
  connected: 'Conectado',
  ready_for_first_message: 'Pronto p/ mensagem',
  first_message_sent: 'Mensagem enviada',
  waiting_followup_1: 'Aguardando follow-up 1',
  followup_1_sent: 'Follow-up 1 enviado',
  waiting_followup_2: 'Aguardando follow-up 2',
  followup_2_sent: 'Follow-up 2 enviado',
  replied: 'Respondeu',
  interested: 'Interessado',
  not_interested: 'Não interessado',
  completed: 'Concluído',
  error: 'Erro',
};

const STATUS_TONES: Record<LeadStatus, Tone> = {
  discovered: 'neutral',
  qualified: 'info',
  rejected: 'neutral',
  ready_for_connection: 'info',
  connection_requested: 'info',
  waiting_connection: 'info',
  connected: 'success',
  ready_for_first_message: 'info',
  first_message_sent: 'info',
  waiting_followup_1: 'warning',
  followup_1_sent: 'warning',
  waiting_followup_2: 'warning',
  followup_2_sent: 'warning',
  replied: 'success',
  interested: 'success',
  not_interested: 'neutral',
  completed: 'neutral',
  error: 'danger',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
