import { z } from 'zod';

/**
 * Configuração central do sistema. Tudo que vem do ambiente passa por aqui —
 * nenhum `process.env.X` espalhado pelo resto do código.
 */

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === '' ? defaultValue : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
    );

const int = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? defaultValue : Number(value)))
    .pipe(z.number().int());

const schema = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:5432/linkedin_prospect'),

  APP_SECRET: z.string().default('dev-only-secret-change-me-0123456789abcdef'),
  ADMIN_PASSWORD: z.string().default('admin'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  /** `auto` usa OpenAI quando há chave e cai para o gerador determinístico quando não há. */
  AI_MODE: z.enum(['auto', 'openai', 'mock']).default('auto'),

  LINKEDIN_ADAPTER: z.enum(['mock', 'real']).default('mock'),
  DRY_RUN: bool(true),
  HEADLESS: bool(false),
  CHROME_PROFILE_DIR: z.string().default('.data/chrome-profile'),
  /** Caminho de um Chromium/Chrome próprio. Vazio = o que o Playwright baixou. */
  CHROME_EXECUTABLE_PATH: z.string().optional(),
  SCREENSHOT_DIR: z.string().default('.data/screenshots'),

  ENABLE_DISCOVERY: bool(true),
  ENABLE_CONNECTIONS: bool(true),
  ENABLE_MESSAGES: bool(true),
  ENABLE_FOLLOWUPS: bool(true),
  ENABLE_REPLY_CHECK: bool(true),

  WORKER_TICK_SECONDS: int(60),
  ACTIONS_PER_HOUR: int(20),
  MIN_ACTION_DELAY_MS: int(4000),
  MAX_ACTION_DELAY_MS: int(12000),
  CONNECTION_CHECK_INTERVAL_HOURS: int(6),
  CONNECTION_EXPIRE_DAYS: int(30),

  /** Fuso usado para calcular "hoje" nos limites diários e no dashboard. */
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Apenas para testes. */
export function resetConfigCache(): void {
  cached = null;
}

export function isAiMocked(): boolean {
  const config = getConfig();
  if (config.AI_MODE === 'mock') return true;
  if (config.AI_MODE === 'openai') return false;
  return !config.OPENAI_API_KEY;
}

export const FEATURE_FLAG_KEYS = [
  'ENABLE_DISCOVERY',
  'ENABLE_CONNECTIONS',
  'ENABLE_MESSAGES',
  'ENABLE_FOLLOWUPS',
  'ENABLE_REPLY_CHECK',
] as const;
