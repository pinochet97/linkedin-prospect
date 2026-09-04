import 'dotenv/config';
import { closePool } from '@/lib/db/client';
import { createCampaign, listCampaigns } from '@/lib/db/repositories/campaigns';
import { getSettings, updateSettings } from '@/lib/db/repositories/settings';

/**
 * Cria uma campanha de exemplo e um perfil de comunicação, para conseguir
 * exercitar o sistema logo depois de rodar as migrations.
 */
async function main() {
  const settings = await getSettings();
  if (!settings.my_name) {
    await updateSettings({
      my_name: 'Kaio',
      my_role: 'Sócio',
      what_i_do:
        'Atuo próximo a founders de startups, principalmente em M&A, governança financeira, FP&A e tecnologia.',
      target_audience: 'Founders e C-levels de SaaS B2B no Brasil.',
      tone_of_voice: 'Informal, direto, curto, natural.',
      things_to_avoid: [
        'linguagem comercial agressiva',
        '"solução inovadora"',
        '"sinergia"',
        '"gostaria de apresentar"',
        'textos longos',
        'frases genéricas',
        'cara de IA',
      ].join('\n'),
    });
    console.log('[seed] perfil de comunicação preenchido.');
  }

  const campaigns = await listCampaigns({ includeArchived: true });
  if (campaigns.length === 0) {
    const id = await createCampaign({
      name: 'Founders SaaS Brasil',
      search_query: 'Founder SaaS Brasil',
      linkedin_search_url: null,
      icp_description: 'Founders, CEOs ou co-founders de empresas SaaS B2B brasileiras.',
      qualification_threshold: 60,
      connection_note_max_chars: 200,
      daily_connection_limit: 20,
      daily_message_limit: 30,
      discovery_target: 25,
    });
    console.log(`[seed] campanha de exemplo criada: ${id}`);
  } else {
    console.log('[seed] já existem campanhas, nada a criar.');
  }

  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
