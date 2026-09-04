import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/table';
import { getDashboardStats, getTodayStats } from '@/lib/db/repositories/stats';
import { listLogs } from '@/lib/db/repositories/logs';
import { listCampaigns } from '@/lib/db/repositories/campaigns';
import { getCampaignUsageToday } from '@/lib/db/repositories/stats';
import { describeLog } from '@/lib/activity';
import { formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, today, recent, campaigns] = await Promise.all([
    getDashboardStats(),
    getTodayStats(),
    listLogs({ limit: 15 }),
    listCampaigns(),
  ]);

  const active = campaigns.filter((campaign) => campaign.status === 'active');
  const usage = await Promise.all(
    active.map(async (campaign) => ({ campaign, usage: await getCampaignUsageToday(campaign.id) })),
  );

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral da operação." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Campanhas ativas" value={stats.activeCampaigns} />
        <Stat label="Total de leads" value={stats.totalLeads} />
        <Stat label="Novos leads hoje" value={stats.newLeadsToday} />
        <Stat label="Convites enviados" value={stats.connectionsRequested} />
        <Stat label="Conexões aceitas" value={stats.connectionsAccepted} />
        <Stat label="Mensagens enviadas" value={stats.messagesSent} />
        <Stat label="Respostas" value={stats.replies} />
        <Stat label="Interessados" value={stats.interested} tone="success" />
        <Stat label="Erros de automação" value={stats.automationErrors} tone="danger" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ações executadas hoje</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Stat label="Conexões enviadas" value={today.connections} />
            <Stat label="Mensagens enviadas" value={today.messages} />
            <Stat label="Follow-ups" value={today.followups} />
            <Stat label="Respostas detectadas" value={today.repliesDetected} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limites de hoje</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {usage.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma campanha ativa.</p>
            ) : (
              usage.map(({ campaign, usage: used }) => (
                <div key={campaign.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/campaigns/${campaign.id}`} className="truncate hover:underline">
                    {campaign.name}
                  </Link>
                  <div className="flex shrink-0 gap-2 text-xs tabular-nums">
                    <Badge tone={used.connections >= campaign.daily_connection_limit ? 'warning' : 'neutral'}>
                      {used.connections} / {campaign.daily_connection_limit} conexões
                    </Badge>
                    <Badge tone={used.messages >= campaign.daily_message_limit ? 'warning' : 'neutral'}>
                      {used.messages} / {campaign.daily_message_limit} mensagens
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Atividades recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <EmptyState>Nada aconteceu ainda. Crie uma campanha e rode o worker.</EmptyState>
          ) : (
            <ul className="divide-y">
              {recent.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatTime(entry.created_at)}
                  </span>
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
