import '@/lib/load-env';

// A demonstração comprime o tempo: sem espera entre o convite e a verificação
// de aceite, e sem limite horário. Nada disso vale para a operação real.
process.env.CONNECTION_CHECK_INTERVAL_HOURS = '0';
process.env.ACTIONS_PER_HOUR = '10000';
process.env.AI_MODE = process.env.OPENAI_API_KEY ? (process.env.AI_MODE ?? 'auto') : 'mock';

import { MockLinkedInAdapter } from '@/automation/linkedin/mock-adapter';
import { closePool } from '@/lib/db/client';
import { createCampaign, listCampaigns, setCampaignStatus } from '@/lib/db/repositories/campaigns';
import { getCampaignStats } from '@/lib/db/repositories/stats';
import { loadContext } from '@/worker/context';
import { tick } from '@/worker/tick';

/**
 * npm run demo
 *
 * Cria uma campanha de demonstração e roda o motor inteiro contra o LinkedIn
 * simulado: descoberta, qualificação, convite, aceite, mensagem, follow-up e
 * resposta. Nenhum acesso ao LinkedIn real. Serve para ver o sistema
 * funcionando antes de ligar a automação de verdade.
 */
const DEMO_NAME = '[demo] Founders SaaS Brasil';

async function main() {
  const existing = (await listCampaigns({ includeArchived: true })).find((item) => item.name === DEMO_NAME);

  const campaignId =
    existing?.id ??
    (await createCampaign(
      {
        name: DEMO_NAME,
        search_query: 'Founder SaaS Brasil',
        linkedin_search_url: null,
        icp_description: 'Founders, CEOs ou co-founders de empresas SaaS B2B brasileiras.',
        qualification_threshold: 50,
        connection_note_max_chars: 200,
        daily_connection_limit: 20,
        daily_message_limit: 30,
        discovery_target: 12,
      },
      [
        { step_type: 'connection_request', step_order: 1, delay_hours: 0, enabled: true },
        { step_type: 'first_message', step_order: 2, delay_hours: 0, enabled: true },
        { step_type: 'followup_1', step_order: 3, delay_hours: 72, enabled: true },
        { step_type: 'followup_2', step_order: 4, delay_hours: 120, enabled: true },
      ],
    ));

  await setCampaignStatus(campaignId, 'active');

  const adapter = new MockLinkedInAdapter({
    seed: 'demo',
    acceptRate: 0.7,
    acceptAfterChecks: 1,
    replyRate: 0.4,
  });

  const context = await loadContext(adapter, 'demo');
  for (let round = 0; round < 15; round += 1) {
    const summary = await tick(context);
    if (summary.discovered || summary.processed || summary.replies) {
      console.log(
        `[demo] ciclo ${round}: descobertos=${summary.discovered} processados=${summary.processed} respostas=${summary.replies}`,
      );
    }
  }

  const stats = await getCampaignStats(campaignId);
  console.log('\n[demo] resultado:', stats);
  console.log(`[demo] abra http://localhost:3000/campaigns/${campaignId}`);

  await adapter.close();
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
