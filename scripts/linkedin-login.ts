import '@/lib/load-env';
import { resolve } from 'node:path';
import { launchBrowser } from '@/automation/linkedin/browser';
import { LinkedInSelectors, LinkedInUrls } from '@/automation/linkedin/selectors';
import { getConfig } from '@/lib/config';

/**
 * npm run linkedin:login
 *
 * Abre o Chromium com o perfil persistente, vai para o LinkedIn e espera você
 * logar À MÃO. Nenhuma credencial passa pelo sistema — o que fica salvo é o
 * profile do navegador, reutilizado depois pelo worker.
 */
async function main() {
  const config = getConfig();
  const profileDir = resolve(config.CHROME_PROFILE_DIR);

  console.log('Abrindo o Chromium com o perfil persistente…');
  console.log(`Profile: ${profileDir}`);

  const session = await launchBrowser({ headless: false });
  await session.page.goto(LinkedInUrls.home, { waitUntil: 'domcontentloaded' });

  console.log('\nFaça o login manualmente na janela que abriu.');
  console.log('Assim que o feed carregar, a sessão é salva e este comando encerra sozinho.');
  console.log('(Ctrl+C cancela sem salvar nada além do que o navegador já gravou.)\n');

  const deadlineMs = 10 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < deadlineMs) {
    const loggedIn = await Promise.any(
      LinkedInSelectors.signedInMarker.map(async (selector) => {
        await session.page.locator(selector).first().waitFor({ state: 'attached', timeout: 5000 });
        return true;
      }),
    ).catch(() => false);

    if (loggedIn) {
      console.log('Sessão ativa. Perfil salvo em', profileDir);
      console.log('Pode fechar. O worker vai reutilizar essa sessão.');
      await session.close();
      return;
    }
  }

  console.error('Tempo esgotado (10 min) sem detectar login. Rode o comando de novo.');
  await session.close();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
