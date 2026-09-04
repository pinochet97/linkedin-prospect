import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Table, Td, Th } from '@/components/ui/table';
import { listLogs, type LogFilters } from '@/lib/db/repositories/logs';
import { listCampaigns } from '@/lib/db/repositories/campaigns';
import { ACTION_LABELS, describeLog } from '@/lib/activity';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONES = {
  success: 'success',
  failed: 'danger',
  skipped: 'neutral',
  info: 'info',
} as const;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; action?: string; status?: string }>;
}) {
  const { campaign, action, status } = await searchParams;
  const filters: LogFilters = {
    campaignId: campaign || undefined,
    action: action || undefined,
    status: (status as LogFilters['status']) || undefined,
    limit: 200,
  };

  const [logs, campaigns] = await Promise.all([listLogs(filters), listCampaigns({ includeArchived: true })]);

  return (
    <>
      <PageHeader title="Atividade" description="Tudo que a automação executou." />

      <form className="mb-4 flex flex-wrap gap-2">
        <Select name="campaign" defaultValue={campaign ?? ''} className="w-56">
          <option value="">Todas as campanhas</option>
          {campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select name="action" defaultValue={action ?? ''} className="w-56">
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ''} className="w-40">
          <option value="">Todos</option>
          <option value="success">Sucesso</option>
          <option value="failed">Erro</option>
          <option value="skipped">Ignorado</option>
          <option value="info">Info</option>
        </Select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <EmptyState>Nenhum registro com esses filtros.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Ação</Th>
                  <Th>Status</Th>
                  <Th>Descrição</Th>
                  <Th>Campanha</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </Td>
                    <Td className="text-xs">{ACTION_LABELS[entry.action] ?? entry.action}</Td>
                    <Td>
                      <Badge tone={STATUS_TONES[entry.status]}>{entry.status}</Badge>
                    </Td>
                    <Td className="max-w-lg">
                      <p className="truncate text-sm">{describeLog(entry)}</p>
                      {entry.status === 'failed' && entry.message ? (
                        <p className="truncate text-xs text-muted-foreground">{entry.message}</p>
                      ) : null}
                      {entry.screenshot_path ? (
                        <p className="text-xs text-muted-foreground">screenshot: {entry.screenshot_path}</p>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted-foreground">{entry.campaign_name ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
