import { PageHeader } from '@/components/ui/stat';
import { CampaignForm } from '@/components/campaign-form';
import { createCampaignAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function NewCampaignPage() {
  return (
    <>
      <PageHeader title="Nova campanha" description="Busca, ICP, limites e sequência." />
      <CampaignForm action={createCampaignAction} submitLabel="Criar campanha" />
    </>
  );
}
