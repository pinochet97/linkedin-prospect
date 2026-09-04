import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/table';
import { SubmitButton } from '@/components/shell/submit-button';
import { listEnrollments } from '@/lib/db/repositories/leads';
import { listCampaigns } from '@/lib/db/repositories/campaigns';
import { formatDateTime } from '@/lib/utils';
import { INTEREST_STATUSES } from '@/lib/engine/types';
import { setInterestAction } from '../leads/actions';

export const dynamic = 'force-dynamic';

const INTEREST_LABELS: Record<string, string> = {
  interested: 'Interessado',
  not_interested: 'Não interessado',
  meeting_scheduled: 'Reunião marcada',
  later: 'Depois',
  ignore: 'Ignorar',
};

export default async function InboxPage() {
  const [enrollments, campaigns] = await Promise.all([
    listEnrollments({ repliedOnly: true, limit: 200 }),
    listCampaigns({ includeArchived: true }),
  ]);
  const campaignName = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <>
      <PageHeader title="Inbox" description="Leads que responderam. A sequência já foi interrompida." />

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState>Nenhuma resposta ainda.</EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {enrollments.map((enrollment) => (
            <Card key={enrollment.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/leads/${enrollment.id}`} className="text-sm font-medium hover:underline">
                      {enrollment.lead.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[enrollment.lead.job_title ?? enrollment.lead.headline, enrollment.lead.company]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone="info">{campaignName.get(enrollment.campaign_id) ?? '—'}</Badge>
                    {formatDateTime(enrollment.replied_at)}
                  </div>
                </div>

                <p className="rounded-md bg-surface-muted px-3 py-2 text-sm whitespace-pre-wrap">
                  {enrollment.reply_text || <span className="text-muted-foreground">Resposta sem texto capturado.</span>}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  {INTEREST_STATUSES.map((interest) => (
                    <form key={interest} action={setInterestAction}>
                      <input type="hidden" name="id" value={enrollment.id} />
                      <input type="hidden" name="interest" value={interest} />
                      <SubmitButton
                        size="sm"
                        variant={enrollment.interest_status === interest ? 'default' : 'outline'}
                      >
                        {INTEREST_LABELS[interest]}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
