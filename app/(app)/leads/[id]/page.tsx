import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/table';
import { SubmitButton } from '@/components/shell/submit-button';
import { getEnrollment, findDuplicateEnrollments } from '@/lib/db/repositories/leads';
import { listMessages } from '@/lib/db/repositories/messages';
import { listLogs } from '@/lib/db/repositories/logs';
import { getCampaign } from '@/lib/db/repositories/campaigns';
import { describeLog } from '@/lib/activity';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { clearLeadErrorAction, stopLeadSequenceAction } from '../actions';

export const dynamic = 'force-dynamic';

const MESSAGE_LABELS = {
  connection_note: 'Nota do convite',
  first_message: 'Primeira mensagem',
  followup_1: 'Follow-up 1',
  followup_2: 'Follow-up 2',
  inbound_reply: 'Resposta recebida',
} as const;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const enrollment = await getEnrollment(id);
  if (!enrollment) notFound();

  const [campaign, messages, logs, duplicates] = await Promise.all([
    getCampaign(enrollment.campaign_id),
    listMessages(id),
    listLogs({ leadId: enrollment.lead_id, limit: 30 }),
    findDuplicateEnrollments(enrollment.lead_id, enrollment.campaign_id),
  ]);

  const timeline = [
    ['Descoberto', enrollment.created_at],
    ['Convite enviado', enrollment.linkedin_connection_requested_at],
    ['Conexão aceita', enrollment.linkedin_connected_at],
    ['1ª mensagem', enrollment.first_message_sent_at],
    ['Follow-up 1', enrollment.followup_1_sent_at],
    ['Follow-up 2', enrollment.followup_2_sent_at],
    ['Respondeu', enrollment.replied_at],
  ] as const;

  return (
    <>
      <PageHeader
        title={enrollment.lead.full_name}
        description={enrollment.lead.headline ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <a
              href={enrollment.lead.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Perfil <ExternalLink className="h-3 w-3" />
            </a>
            {enrollment.status === 'error' ? (
              <form action={clearLeadErrorAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" variant="outline">
                  Reprocessar
                </SubmitButton>
              </form>
            ) : null}
            {enrollment.next_action && enrollment.next_action !== 'none' ? (
              <form action={stopLeadSequenceAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" variant="ghost">
                  Parar sequência
                </SubmitButton>
              </form>
            ) : null}
          </div>
        }
      />

      {duplicates.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Esta pessoa também está em: {duplicates.map((item) => item.campaign_name).join(', ')}. Evite abordar duas
          vezes.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={enrollment.status} />
              {campaign ? (
                <Link href={`/campaigns/${campaign.id}`}>
                  <Badge tone="info">{campaign.name}</Badge>
                </Link>
              ) : null}
            </div>
            <Row label="Cargo" value={enrollment.lead.job_title} />
            <Row label="Empresa" value={enrollment.lead.company} />
            <Row label="Localização" value={enrollment.lead.location} />
            <Row label="Resumo" value={enrollment.lead.profile_summary} />
            <div className="border-t pt-3">
              <Row label="Score" value={enrollment.qualification_score?.toString()} />
              <Row label="Motivo" value={enrollment.qualification_reason} />
              <Row label="Segmento" value={enrollment.qualification_segment} />
            </div>
            <div className="border-t pt-3">
              <Row
                label="Próxima ação"
                value={
                  enrollment.next_action && enrollment.next_action !== 'none'
                    ? `${enrollment.next_action} · ${formatRelative(enrollment.next_action_at)}`
                    : 'nenhuma'
                }
              />
              {enrollment.last_error ? <Row label="Último erro" value={enrollment.last_error} /> : null}
              {enrollment.retry_count > 0 ? <Row label="Tentativas" value={String(enrollment.retry_count)} /> : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {timeline.map(([label, value]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={`w-36 text-xs ${value ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                  <span className="text-xs text-muted-foreground">{value ? formatDateTime(value) : '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mensagens</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <EmptyState>Nenhuma mensagem gerada ainda.</EmptyState>
              ) : (
                <ul className="divide-y">
                  {messages.map((message) => (
                    <li key={message.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{MESSAGE_LABELS[message.kind]}</span>
                        {message.sent_at ? <span>enviada {formatDateTime(message.sent_at)}</span> : <span>gerada</span>}
                        {message.dry_run ? <Badge tone="warning">dry run</Badge> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
              <Link
                href={`/activity?lead=${enrollment.lead_id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver no feed de atividade
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <EmptyState>Sem logs.</EmptyState>
              ) : (
                <ul className="divide-y">
                  {logs.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-2 text-sm">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </span>
                      <span className={entry.status === 'failed' ? 'text-danger' : undefined}>
                        {describeLog(entry)}
                        {entry.message && entry.status === 'failed' ? (
                          <span className="block text-xs text-muted-foreground">{entry.message}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}
