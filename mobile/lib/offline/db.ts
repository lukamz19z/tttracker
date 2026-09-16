import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("tttracker-mobile.db");
  }
  const db = await databasePromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function setCache<T>(key: string, value: T) {
  const db = await database();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO cache_entries(cache_key,payload,updated_at)
     VALUES(?,?,?)
     ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`,
    key,
    JSON.stringify(value),
    now,
  );
}

export async function getCache<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string; updated_at: string }>(
    "SELECT payload,updated_at FROM cache_entries WHERE cache_key = ?",
    key,
  );
  if (!row) return null;
  return { value: JSON.parse(row.payload) as T, updatedAt: row.updated_at };
}

export async function removeCache(key: string) {
  const db = await database();
  await db.runAsync("DELETE FROM cache_entries WHERE cache_key = ?", key);
}

export type QueueRecord<T = unknown> = {
  id: string;
  kind: string;
  payload: T;
  status: "pending" | "syncing" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function enqueue<T>(kind: string, payload: T, id: string = crypto.randomUUID()) {
  const db = await database();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue(id,kind,payload,status,attempts,last_error,created_at,updated_at)
     VALUES(?,?,?,'pending',0,NULL,?,?)`,
    id,
    kind,
    JSON.stringify(payload),
    now,
    now,
  );
  return id;
}

export async function queueRows(): Promise<QueueRecord[]> {
  const db = await database();
  const rows = await db.getAllAsync<{
    id: string;
    kind: string;
    payload: string;
    status: "pending" | "syncing" | "failed";
    attempts: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM sync_queue ORDER BY created_at ASC");

  return rows.map((row: {
    id: string;
    kind: string;
    payload: string;
    status: "pending" | "syncing" | "failed";
    attempts: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }) => ({
    id: row.id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateQueueStatus(
  id: string,
  status: QueueRecord["status"],
  error?: string | null,
) {
  const db = await database();
  await db.runAsync(
    `UPDATE sync_queue
     SET status=?, attempts=attempts+CASE WHEN ?='failed' THEN 1 ELSE 0 END, last_error=?, updated_at=?
     WHERE id=?`,
    status,
    status,
    error ?? null,
    new Date().toISOString(),
    id,
  );
}

export async function removeQueueRecord(id: string) {
  const db = await database();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", id);
}
