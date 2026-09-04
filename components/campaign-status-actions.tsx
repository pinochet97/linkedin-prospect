import { changeCampaignStatusAction } from '@/app/(app)/campaigns/actions';
import { SubmitButton } from '@/components/shell/submit-button';
import type { CampaignStatus } from '@/lib/engine/types';

/** Iniciar / pausar / arquivar. Um form por ação — sem JS extra. */
export function CampaignStatusActions({ id, status }: { id: string; status: CampaignStatus }) {
  return (
    <div className="flex justify-end gap-1.5">
      {status !== 'active' && status !== 'archived' ? (
        <form action={changeCampaignStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="active" />
          <SubmitButton size="sm">Iniciar</SubmitButton>
        </form>
      ) : null}

      {status === 'active' ? (
        <form action={changeCampaignStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="paused" />
          <SubmitButton size="sm" variant="outline">
            Pausar
          </SubmitButton>
        </form>
      ) : null}

      {status !== 'archived' ? (
        <form action={changeCampaignStatusAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="archived" />
          <SubmitButton size="sm" variant="ghost">
            Arquivar
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
