/**
 * Helper mínimo para montar UPDATEs a partir de um objeto coluna -> valor.
 * Evita repetir listas de parâmetros posicionais espalhadas pelos repositórios.
 */
export function buildUpdate(
  table: string,
  patch: Record<string, unknown>,
  where: { column: string; value: unknown },
  options: { touchUpdatedAt?: boolean } = {},
): { text: string; values: unknown[] } | null {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return null;

  const values: unknown[] = [];
  const assignments = entries.map(([column, value]) => {
    values.push(value);
    return `${column} = $${values.length}`;
  });

  if (options.touchUpdatedAt !== false) assignments.push('updated_at = now()');

  values.push(where.value);
  return {
    text: `update ${table} set ${assignments.join(', ')} where ${where.column} = $${values.length}`,
    values,
  };
}
