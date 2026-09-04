import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/stat';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { LeadsTable } from '@/components/leads-table';
import { listCampaigns } from '@/lib/db/repositories/campaigns';
import { countEnrollments, listEnrollments } from '@/lib/db/repositories/leads';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/engine/types';
import { STATUS_LABELS } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; status?: string; q?: string }>;
}) {
  const { campaign, status, q } = await searchParams;
  const campaigns = await listCampaigns({ includeArchived: true });

  const filters = {
    campaignId: campaign || undefined,
    status: (LEAD_STATUSES as readonly string[]).includes(status ?? '') ? (status as LeadStatus) : undefined,
    search: q || undefined,
    limit: 200,
  };

  const [enrollments, total] = await Promise.all([listEnrollments(filters), countEnrollments(filters)]);

  return (
    <>
      <PageHeader title="Leads" description={`${total} lead(s) na base.`} />

      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q ?? ''} placeholder="Buscar por nome, empresa ou headline" className="w-72" />
        <Select name="campaign" defaultValue={campaign ?? ''} className="w-56">
          <option value="">Todas as campanhas</option>
          {campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ''} className="w-56">
          <option value="">Todos os status</option>
          {LEAD_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <LeadsTable enrollments={enrollments} showCampaign={!campaign} />
        </CardContent>
      </Card>
    </>
  );
}
