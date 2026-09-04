import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, Table, Td, Th } from '@/components/ui/table';
import { listCampaigns } from '@/lib/db/repositories/campaigns';
import { getCampaignStats } from '@/lib/db/repositories/stats';
import { formatDateTime } from '@/lib/utils';
import { CampaignStatusActions } from '@/components/campaign-status-actions';

export const dynamic = 'force-dynamic';

const STATUS_TONES = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  archived: 'neutral',
} as const;

const STATUS_LABELS = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
} as const;

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const includeArchived = archived === '1';
  const campaigns = await listCampaigns({ includeArchived });
  const stats = await Promise.all(campaigns.map((campaign) => getCampaignStats(campaign.id)));

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Cada campanha é uma busca + uma sequência."
        action={
          <Link href="/campaigns/new" className={buttonVariants()}>
            Nova campanha
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <EmptyState>Nenhuma campanha ainda.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Campanha</Th>
                  <Th>Status</Th>
                  <Th>Leads</Th>
                  <Th>Convites</Th>
                  <Th>Conectados</Th>
                  <Th>Respostas</Th>
                  <Th>Criada em</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign, index) => (
                  <tr key={campaign.id}>
                    <Td>
                      <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                        {campaign.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {campaign.search_query ?? campaign.linkedin_search_url}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
                    </Td>
                    <Td className="tabular-nums">{stats[index].found}</Td>
                    <Td className="tabular-nums">{stats[index].connectionRequested}</Td>
                    <Td className="tabular-nums">{stats[index].connected}</Td>
                    <Td className="tabular-nums">{stats[index].replied}</Td>
                    <Td className="text-xs text-muted-foreground">{formatDateTime(campaign.created_at)}</Td>
                    <Td>
                      <CampaignStatusActions id={campaign.id} status={campaign.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        <Link href={includeArchived ? '/campaigns' : '/campaigns?archived=1'} className="hover:underline">
          {includeArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
        </Link>
      </p>
    </>
  );
}
