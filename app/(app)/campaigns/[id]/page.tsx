import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Stat } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/table';
import { SubmitButton } from '@/components/shell/submit-button';
import { CampaignStatusActions } from '@/components/campaign-status-actions';
import { LeadsTable } from '@/components/leads-table';
import { getCampaign, getCampaignSteps } from '@/lib/db/repositories/campaigns';
import { listEnrollments } from '@/lib/db/repositories/leads';
import { listLogs } from '@/lib/db/repositories/logs';
import { getCampaignStats, getCampaignUsageToday } from '@/lib/db/repositories/stats';
import { STEP_LABELS } from '@/lib/engine/sequence';
import { describeLog } from '@/lib/activity';
import { formatDateTime } from '@/lib/utils';
import { runDiscoveryAction } from '../actions';

export const dynamic = 'force-dynamic';

const DISCOVERY_LABELS = {
  pending: 'na fila',
  running: 'rodando',
  done: 'concluída',
  failed: 'falhou',
} as const;

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [steps, stats, usage, enrollments, logs] = await Promise.all([
    getCampaignSteps(id),
    getCampaignStats(id),
    getCampaignUsageToday(id),
    listEnrollments({ campaignId: id, limit: 100 }),
    listLogs({ campaignId: id, limit: 20 }),
  ]);

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={campaign.search_query ?? campaign.linkedin_search_url ?? ''}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/campaigns/${id}/edit`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Editar
            </Link>
            <CampaignStatusActions id={id} status={campaign.status} />
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <Stat label="Encontrados" value={stats.found} />
        <Stat label="Qualificados" value={stats.qualified} />
        <Stat label="Convites" value={stats.connectionRequested} />
        <Stat label="Conectados" value={stats.connected} />
        <Stat label="Mensagens" value={stats.messaged} />
        <Stat label="Respostas" value={stats.replied} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">ICP</p>
              <p>{campaign.icp_description || <span className="text-muted-foreground">não definido</span>}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge>score mínimo {campaign.qualification_threshold}</Badge>
              <Badge>nota até {campaign.connection_note_max_chars} chars</Badge>
              <Badge tone={usage.connections >= campaign.daily_connection_limit ? 'warning' : 'neutral'}>
                {usage.connections} / {campaign.daily_connection_limit} convites hoje
              </Badge>
              <Badge tone={usage.messages >= campaign.daily_message_limit ? 'warning' : 'neutral'}>
                {usage.messages} / {campaign.daily_message_limit} mensagens hoje
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Descoberta: {DISCOVERY_LABELS[campaign.discovery_status]}
                {campaign.discovery_last_run_at ? ` · ${formatDateTime(campaign.discovery_last_run_at)}` : ''}
                {campaign.discovery_error ? ` · ${campaign.discovery_error}` : ''}
              </p>
              <form action={runDiscoveryAction}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton size="sm" variant="outline">
                  Rodar descoberta
                </SubmitButton>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sequência</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3">
                <span className="w-5 text-xs text-muted-foreground">{step.step_order}</span>
                <span className={step.enabled ? '' : 'text-muted-foreground line-through'}>
                  {STEP_LABELS[step.step_type]}
                </span>
                {step.delay_hours > 0 ? (
                  <span className="text-xs text-muted-foreground">após {step.delay_hours}h</span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <LeadsTable enrollments={enrollments} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Atividade da campanha</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <EmptyState>Sem atividade registrada.</EmptyState>
          ) : (
            <ul className="divide-y">
              {logs.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                  <span className={entry.status === 'failed' ? 'text-danger' : undefined}>{describeLog(entry)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
