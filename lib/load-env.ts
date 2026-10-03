import { config } from 'dotenv';

/**
 * Carrega o .env para os processos que rodam fora do Next.js (worker e
 * scripts). `quiet` evita o banner do dotenv poluindo a saída do worker.
 */
config({ quiet: true });
