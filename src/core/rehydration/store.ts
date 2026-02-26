import type { SqliteDatabase } from '../database.js';

export interface TokenEntry {
  original: string;
  tokenized: string;
  type: 'dictionary' | 'regex' | 'names' | 'ner';
  category: string;
  meta?: Record<string, string>;
}

export interface SessionData {
  sessionId: string;
  tokens: TokenEntry[];
  createdAt: string;
  expiresAt: string;
  lastAccessedAt: string;
}

const CLEANUP_INTERVAL_MS = 60 * 1000;
const SESSION_ID_REGEX = /^[a-f0-9\-]{36}$/i;

export class RehydrationStore {
  private db: SqliteDatabase;
  private defaultTTL = 3600;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(db: SqliteDatabase) {
    this.db = db;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  private cleanupExpired(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    return result.changes;
  }

  private static isValidSessionId(id: string): boolean {
    return SESSION_ID_REGEX.test(id);
  }

  async store(
    sessionId: string,
    tokens: Map<string, string>,
    ttlSeconds: number = this.defaultTTL,
    type: 'dictionary' | 'regex' | 'names' | 'ner' = 'regex',
    category: string = 'PII',
    meta?: Record<string, string>
  ): Promise<void> {
    if (!RehydrationStore.isValidSessionId(sessionId)) {
      throw new Error('Invalid session ID format');
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // Get existing session data for deduplication
    const existingData = await this.retrieve(sessionId);
    const existingTokens = existingData?.tokens || [];
    const existingOriginals = new Set(existingTokens.map(t => t.original.toLowerCase()));

    const newTokens: TokenEntry[] = [];
    for (const [tokenized, original] of tokens) {
      if (!existingOriginals.has(original.toLowerCase())) {
        newTokens.push({ original, tokenized, type, category, meta });
        existingOriginals.add(original.toLowerCase());
      }
    }

    const allTokens = [...existingTokens, ...newTokens];
    const session: SessionData = {
      sessionId,
      tokens: allTokens,
      createdAt: existingData?.createdAt || now,
      expiresAt,
      lastAccessedAt: now,
    };

    this.db.prepare(`
      INSERT INTO sessions (session_id, data, created_at, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        data = excluded.data,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).run(sessionId, JSON.stringify(session), session.createdAt, expiresAt, now);
  }

  async retrieve(sessionId: string): Promise<SessionData | null> {
    if (!RehydrationStore.isValidSessionId(sessionId)) {
      return null;
    }

    const now = new Date().toISOString();
    const row = this.db.prepare(
      'SELECT data FROM sessions WHERE session_id = ? AND expires_at > ?'
    ).get(sessionId, now) as { data: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  async hydrate(text: string, sessionId: string): Promise<string> {
    const session = await this.retrieve(sessionId);
    if (!session) return text;

    let result = text;
    for (const token of session.tokens) {
      result = result.replaceAll(token.tokenized, token.original);
    }
    return result;
  }

  async delete(sessionId: string): Promise<boolean> {
    if (!RehydrationStore.isValidSessionId(sessionId)) {
      return false;
    }
    const result = this.db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    return result.changes > 0;
  }

  async deleteAll(): Promise<number> {
    const result = this.db.prepare('DELETE FROM sessions').run();
    return result.changes;
  }

  async extend(sessionId: string, ttlSeconds: number): Promise<boolean> {
    if (!RehydrationStore.isValidSessionId(sessionId)) {
      return false;
    }
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const now = new Date().toISOString();
    const result = this.db.prepare(
      'UPDATE sessions SET expires_at = ?, updated_at = ? WHERE session_id = ?'
    ).run(expiresAt, now, sessionId);
    return result.changes > 0;
  }

  async size(): Promise<number> {
    const now = new Date().toISOString();
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?'
    ).get(now) as { count: number };
    return row.count;
  }

  async getAllSessions(): Promise<SessionData[]> {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT data FROM sessions WHERE expires_at > ? ORDER BY created_at DESC'
    ).all(now) as { data: string }[];

    const sessions: SessionData[] = [];
    for (const row of rows) {
      try {
        sessions.push(JSON.parse(row.data));
      } catch {
        // Skip invalid data
      }
    }
    return sessions;
  }

  async search(query: string): Promise<SessionData[]> {
    const sessions = await this.getAllSessions();
    const lowerQuery = query.toLowerCase();

    return sessions.filter(session =>
      session.tokens.some(t =>
        t.original.toLowerCase().includes(lowerQuery) ||
        t.category.toLowerCase().includes(lowerQuery) ||
        (t.meta && Object.values(t.meta).some(v => v.toLowerCase().includes(lowerQuery)))
      )
    );
  }

  async getStorageStats(): Promise<{
    sessionCount: number;
    totalTokens: number;
    storageConnected: boolean;
    dbSize?: string;
  }> {
    const sessions = await this.getAllSessions();
    const totalTokens = sessions.reduce((sum, s) => sum + s.tokens.length, 0);

    let dbSize: string | undefined;
    try {
      const pageCount = this.db.pragma('page_count', { simple: true }) as number;
      const pageSize = this.db.pragma('page_size', { simple: true }) as number;
      const bytes = pageCount * pageSize;
      dbSize = formatBytes(bytes);
    } catch {
      // Ignore pragma errors
    }

    return {
      sessionCount: sessions.length,
      totalTokens,
      storageConnected: true,
      dbSize,
    };
  }

  async cleanup(): Promise<number> {
    return this.cleanupExpired();
  }

  async getStats(): Promise<{ activeSessions: number; storageConnected: boolean }> {
    return {
      activeSessions: await this.size(),
      storageConnected: true,
    };
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
