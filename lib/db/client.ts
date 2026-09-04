import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getConfig } from '@/lib/config';

/**
 * Pool único do processo. O Next.js recarrega módulos em dev, por isso o pool
 * é guardado no globalThis.
 */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    const connectionString = getConfig().DATABASE_URL;
    globalForDb.__pgPool = new Pool({
      connectionString,
      max: 10,
      // Supabase exige TLS; o certificado é da cadeia deles, não precisamos validar
      // contra a CA local para uma conexão administrativa de uso interno.
      ssl: /supabase|amazonaws|neon|render/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDb.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalForDb.__pgPool) {
    await globalForDb.__pgPool.end();
    globalForDb.__pgPool = undefined;
  }
}
