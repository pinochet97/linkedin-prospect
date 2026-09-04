import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/stat';
import { CampaignForm } from '@/components/campaign-form';
import { getCampaign, getCampaignSteps } from '@/lib/db/repositories/campaigns';
import { updateCampaignAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const steps = await getCampaignSteps(id);

  return (
    <>
      <PageHeader title="Editar campanha" description={campaign.name} />
      <CampaignForm action={updateCampaignAction} campaign={campaign} steps={steps} submitLabel="Salvar alterações" />
    </>
  );
}
