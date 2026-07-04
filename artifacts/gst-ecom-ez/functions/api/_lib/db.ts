export async function dbCreate(
  db: D1Database,
  table: string,
  id: string,
  data: object
): Promise<void> {
  await db
    .prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`)
    .bind(id, JSON.stringify(data))
    .run();
}

export async function dbGet<T>(
  db: D1Database,
  table: string,
  id: string
): Promise<T | null> {
  const row = await db
    .prepare(`SELECT id, data FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ id: string; data: string }>();
  return row ? ({ ...JSON.parse(row.data), id: row.id } as T) : null;
}

export async function dbUpdate(
  db: D1Database,
  table: string,
  id: string,
  data: object
): Promise<void> {
  await db
    .prepare(`UPDATE ${table} SET data = ? WHERE id = ?`)
    .bind(JSON.stringify(data), id)
    .run();
}

export async function dbPatch(
  db: D1Database,
  table: string,
  id: string,
  patch: Record<string, unknown>
): Promise<object | null> {
  const existing = await dbGet<Record<string, unknown>>(db, table, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await dbUpdate(db, table, id, updated);
  return updated;
}

export async function dbList<T>(
  db: D1Database,
  table: string,
  filters: Record<string, string> = {},
  extra: { limit?: number; orderBy?: string } = {}
): Promise<T[]> {
  const conditions: string[] = [];
  const params: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    conditions.push(`json_extract(data, '$.${key}') = ?`);
    params.push(value);
  }

  let sql = `SELECT id, data FROM ${table}`;
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  if (extra.orderBy) sql += ` ORDER BY ${extra.orderBy}`;
  if (extra.limit) sql += ` LIMIT ${extra.limit}`;

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<{ id: string; data: string }>();

  return (result.results ?? []).map(
    (row) => ({ ...JSON.parse(row.data), id: row.id } as T)
  );
}

export async function dbCount(
  db: D1Database,
  table: string,
  filters: Record<string, string> = {}
): Promise<number> {
  const conditions: string[] = [];
  const params: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    conditions.push(`json_extract(data, '$.${key}') = ?`);
    params.push(value);
  }
  let sql = `SELECT COUNT(*) as cnt FROM ${table}`;
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  const row = await db.prepare(sql).bind(...params).first<{ cnt: number }>();
  return row?.cnt ?? 0;
}
