import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type SqliteDatabase = InstanceType<typeof Database>;

const DEFAULT_SETTINGS: Record<string, any> = {
  enableDictionary: true,
  enableRegex: true,
  enableNames: true,
  enableNER: true,
  nerModel: 'Xenova/bert-base-NER',
  nerMinConfidence: 0.6,
  tokenizePlaceholders: true,
  placeholderPrefix: '\uE000',
  placeholderSuffix: '\uE001',
};

let dbInstance: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance) return dbInstance;

  const resolvedPath = dbPath || process.env.ANONAMOOSE_DB_PATH || './data/anonamoose.db';

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('journal_mode = WAL');
  initializeSchema(dbInstance);

  return dbInstance;
}

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id  TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dictionary (
      id              TEXT PRIMARY KEY,
      term            TEXT NOT NULL,
      replacement     TEXT,
      case_sensitive  INTEGER NOT NULL DEFAULT 0,
      whole_word      INTEGER NOT NULL DEFAULT 0,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL
    );
  `);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, JSON.stringify(value), now);
    }
  });
  seed();
}

export function getSetting<T = any>(db: Database.Database, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

export function setSetting(db: Database.Database, key: string, value: any): void {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function getAllSettings(db: Database.Database): Record<string, any> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, any> = {};
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value);
  }
  return settings;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
