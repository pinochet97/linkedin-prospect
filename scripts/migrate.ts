import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closePool, getPool } from '@/lib/db/client';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

async function main() {
  const pool = getPool();
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((row) => row.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] aplicada: ${file}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      console.error(`[migrate] FALHOU: ${file}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? '[migrate] nada a aplicar, banco atualizado.' : `[migrate] ${count} migration(s) aplicada(s).`);
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
