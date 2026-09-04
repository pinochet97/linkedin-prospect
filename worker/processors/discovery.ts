import { getActiveCampaigns, setDiscoveryStatus } from '@/lib/db/repositories/campaigns';
import { upsertLeadAndEnroll } from '@/lib/db/repositories/leads';
import { log } from '@/lib/db/repositories/logs';
import { ACTIONS } from '@/lib/activity';
import { AutomationError } from '@/automation/linkedin';
import type { WorkerContext } from '../context';

/**
 * Descoberta de leads. Roda uma campanha por vez e só quando a descoberta
 * está pendente — não fica varrendo o LinkedIn sem necessidade.
 */
export async function processDiscovery(context: WorkerContext): Promise<number> {
  if (!context.config.ENABLE_DISCOVERY || context.settings.automation_paused) return 0;

  const campaigns = (await getActiveCampaigns()).filter((campaign) => campaign.discovery_status === 'pending');
  let discovered = 0;

  for (const campaign of campaigns) {
    await setDiscoveryStatus(campaign.id, 'running');
    try {
      const profiles = await context.adapter.searchPeople({
        searchUrl: campaign.linkedin_search_url,
        query: campaign.search_query,
        limit: campaign.discovery_target,
      });

      let created = 0;
      let duplicates = 0;

      for (const profile of profiles) {
        const result = await upsertLeadAndEnroll(campaign.id, profile);
        if (!result) continue;

        if (result.enrollmentCreated) {
          created += 1;
          discovered += 1;
          await log({
            action: ACTIONS.leadDiscovered,
            status: 'success',
            campaignId: campaign.id,
            leadId: result.leadId,
            enrollmentId: result.enrollmentId,
            message: profile.fullName,
            metadata: {
              alreadyInOtherCampaigns: result.otherCampaignIds.length,
            },
          });
        } else {
          duplicates += 1;
        }
      }

      await setDiscoveryStatus(campaign.id, 'done');
      await log({
        action: ACTIONS.discovery,
        status: 'success',
        campaignId: campaign.id,
        message: `${created} lead(s) novo(s), ${duplicates} já conhecido(s).`,
        metadata: { found: profiles.length, created, duplicates },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setDiscoveryStatus(campaign.id, 'failed', message.slice(0, 500));
      await log({
        action: ACTIONS.discovery,
        status: 'failed',
        campaignId: campaign.id,
        message: message.slice(0, 500),
        screenshotPath: error instanceof AutomationError ? error.screenshotPath : null,
        metadata: error instanceof AutomationError ? error.context : {},
      });
    }
  }

  return discovered;
}
