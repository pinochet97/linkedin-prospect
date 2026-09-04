import '@/lib/load-env';
import { createLinkedInAdapter } from '@/automation/linkedin';
import { getConfig } from '@/lib/config';
import { closePool } from '@/lib/db/client';
import { log } from '@/lib/db/repositories/logs';
import { ACTIONS } from '@/lib/activity';
import { createWorkerId, loadContext } from './context';
import { tick } from './tick';

/**
 * Entrada do worker (`npm run worker`). Um processo, um loop, sem fila
 * externa. `--once` roda um ciclo só — útil para depurar.
 */
async function main() {
  const config = getConfig();
  const once = process.argv.includes('--once');
  const workerId = createWorkerId();
  const adapter = createLinkedInAdapter();

  console.log(
    `[worker] ${workerId} | adapter=${adapter.name} | dry_run=${config.DRY_RUN} | tick=${config.WORKER_TICK_SECONDS}s`,
  );

  let running = true;
  const stop = async (signal: string) => {
    if (!running) return;
    running = false;
    console.log(`\n[worker] ${signal}: encerrando…`);
    await adapter.close().catch(() => undefined);
    await closePool().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  while (running) {
    try {
      // As configurações são relidas a cada ciclo: pausar pela UI tem efeito
      // no próximo ciclo, sem reiniciar nada.
      const context = await loadContext(adapter, workerId);
      const summary = await tick(context);

      if (summary.discovered || summary.processed || summary.failed || summary.replies) {
        console.log(
          `[worker] descobertos=${summary.discovered} processados=${summary.processed} ` +
            `ignorados=${summary.skipped} falhas=${summary.failed} respostas=${summary.replies}`,
        );
      }
    } catch (error) {
      console.error('[worker] ciclo falhou:', error);
      await log({
        action: ACTIONS.worker,
        status: 'failed',
        message: error instanceof Error ? error.message.slice(0, 500) : String(error),
      }).catch(() => undefined);
    }

    if (once) break;
    await new Promise((done) => setTimeout(done, config.WORKER_TICK_SECONDS * 1000));
  }

  await adapter.close().catch(() => undefined);
  await closePool().catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
