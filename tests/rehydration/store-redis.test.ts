import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SessionData } from '../../src/core/rehydration/store.js';

// ── Redis mock ──────────────────────────────────────────────────────
const mockRedis = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  get: vi.fn(),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn(),
  expire: vi.fn(),
  scan: vi.fn(),
  info: vi.fn(),
  status: 'ready' as string,
};

const RedisConstructor = vi.fn(() => mockRedis);

vi.mock('ioredis', () => {
  return {
    default: RedisConstructor,
  };
});

// Import AFTER mock is registered
const { RehydrationStore } = await import('../../src/core/rehydration/store.js');

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_ID_2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REDIS_KEY = `anonamoose:session:${VALID_ID}`;

const makeSession = (id: string, tokens: SessionData['tokens'] = []): SessionData => ({
  sessionId: id,
  tokens,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  lastAccessedAt: new Date().toISOString(),
});

// ── Tests ───────────────────────────────────────────────────────────
describe('RehydrationStore (Redis mock)', () => {
  let store: InstanceType<typeof RehydrationStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.status = 'ready';
    // Default scan: return no keys (cursor '0' signals done)
    mockRedis.scan.mockResolvedValue(['0', []]);
    // Default get: return null
    mockRedis.get.mockResolvedValue(null);

    store = new RehydrationStore('redis://localhost:6379');
  });

  afterEach(() => {
    store.destroy();
  });

  // ── store() ───────────────────────────────────────────────────
  describe('store()', () => {
    it('should store a session via Redis SETEX', async () => {
      const tokens = new Map([['\uE000t1\uE001', 'Sarah']]);
      await store.store(VALID_ID, tokens, 3600, 'ner', 'PERSON');

      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      const [key, ttl, data] = mockRedis.setex.mock.calls[0];
      expect(key).toBe(REDIS_KEY);
      expect(ttl).toBe(3600);

      const parsed = JSON.parse(data);
      expect(parsed.sessionId).toBe(VALID_ID);
      expect(parsed.tokens).toHaveLength(1);
      expect(parsed.tokens[0].original).toBe('Sarah');
      expect(parsed.tokens[0].type).toBe('ner');
      expect(parsed.tokens[0].category).toBe('PERSON');
    });

    it('should deduplicate when appending to existing session', async () => {
      const existing = makeSession(VALID_ID, [
        { original: 'Sarah', tokenized: '\uE000t1\uE001', type: 'ner', category: 'PERSON' },
      ]);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(existing));

      const tokens = new Map([
        ['\uE000t2\uE001', 'Sarah'],   // duplicate — should be skipped
        ['\uE000t3\uE001', 'London'],   // new — should be added
      ]);
      await store.store(VALID_ID, tokens);

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.tokens).toHaveLength(2);
      expect(storedData.tokens.map((t: any) => t.original)).toEqual(['Sarah', 'London']);
    });

    it('should store meta on tokens', async () => {
      const tokens = new Map([['\uE000t1\uE001', 'data']]);
      await store.store(VALID_ID, tokens, 3600, 'regex', 'PII', { source: 'proxy' });

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.tokens[0].meta).toEqual({ source: 'proxy' });
    });
  });

  // ── retrieve() ────────────────────────────────────────────────
  describe('retrieve()', () => {
    it('should retrieve a session from Redis', async () => {
      const session = makeSession(VALID_ID, [
        { original: 'Alice', tokenized: '\uE000t1\uE001', type: 'dictionary', category: 'CUSTOM' },
      ]);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(session));

      const result = await store.retrieve(VALID_ID);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(VALID_ID);
      expect(result!.tokens[0].original).toBe('Alice');
      expect(mockRedis.get).toHaveBeenCalledWith(REDIS_KEY);
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await store.retrieve(VALID_ID);
      expect(result).toBeNull();
    });

    it('should return null on invalid JSON', async () => {
      mockRedis.get.mockResolvedValueOnce('not-valid-json{{{');
      const result = await store.retrieve(VALID_ID);
      expect(result).toBeNull();
    });
  });

  // ── hydrate() ─────────────────────────────────────────────────
  describe('hydrate()', () => {
    it('should rehydrate tokens via Redis session', async () => {
      const session = makeSession(VALID_ID, [
        { original: 'Auckland', tokenized: '\uE000tok1\uE001', type: 'ner', category: 'LOCATION' },
      ]);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(session));

      const result = await store.hydrate('I live in \uE000tok1\uE001', VALID_ID);
      expect(result).toBe('I live in Auckland');
    });
  });

  // ── delete() ──────────────────────────────────────────────────
  describe('delete()', () => {
    it('should delete a session from Redis', async () => {
      mockRedis.del.mockResolvedValueOnce(1);
      const result = await store.delete(VALID_ID);
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(REDIS_KEY);
    });

    it('should return false when session does not exist', async () => {
      mockRedis.del.mockResolvedValueOnce(0);
      const result = await store.delete(VALID_ID);
      expect(result).toBe(false);
    });
  });

  // ── deleteAll() ───────────────────────────────────────────────
  describe('deleteAll()', () => {
    it('should delete all sessions from Redis', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['anonamoose:session:a', 'anonamoose:session:b']]);
      mockRedis.del.mockResolvedValueOnce(2);

      const count = await store.deleteAll();
      expect(count).toBe(2);
      expect(mockRedis.del).toHaveBeenCalledWith('anonamoose:session:a', 'anonamoose:session:b');
    });

    it('should return 0 when no sessions exist', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      const count = await store.deleteAll();
      expect(count).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // ── extend() ──────────────────────────────────────────────────
  describe('extend()', () => {
    it('should extend TTL via Redis EXPIRE', async () => {
      mockRedis.expire.mockResolvedValueOnce(1);
      const result = await store.extend(VALID_ID, 7200);
      expect(result).toBe(true);
      expect(mockRedis.expire).toHaveBeenCalledWith(REDIS_KEY, 7200);
    });

    it('should return false when key does not exist', async () => {
      mockRedis.expire.mockResolvedValueOnce(0);
      const result = await store.extend(VALID_ID, 3600);
      expect(result).toBe(false);
    });
  });

  // ── size() ────────────────────────────────────────────────────
  describe('size()', () => {
    it('should return count of Redis keys', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['k1', 'k2', 'k3']]);
      const count = await store.size();
      expect(count).toBe(3);
    });

    it('should return 0 when no keys', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      const count = await store.size();
      expect(count).toBe(0);
    });
  });

  // ── scanKeys() (multi-page cursor) ────────────────────────────
  describe('scanKeys (cursor pagination)', () => {
    it('should paginate through multiple SCAN batches', async () => {
      // First call: returns cursor '42' (not done) + 2 keys
      mockRedis.scan.mockResolvedValueOnce(['42', ['k1', 'k2']]);
      // Second call: returns cursor '0' (done) + 1 key
      mockRedis.scan.mockResolvedValueOnce(['0', ['k3']]);

      const count = await store.size();
      expect(count).toBe(3);
      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
    });
  });

  // ── getAllSessions() ──────────────────────────────────────────
  describe('getAllSessions()', () => {
    it('should fetch and parse all sessions from Redis', async () => {
      const s1 = makeSession(VALID_ID, [
        { original: 'Alice', tokenized: 't1', type: 'ner', category: 'PERSON' },
      ]);
      const s2 = makeSession(VALID_ID_2, [
        { original: 'Bob', tokenized: 't2', type: 'ner', category: 'PERSON' },
      ]);

      mockRedis.scan.mockResolvedValueOnce(['0', ['k1', 'k2']]);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(s1))
        .mockResolvedValueOnce(JSON.stringify(s2));

      const sessions = await store.getAllSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should skip keys with null data', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['k1', 'k2']]);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(makeSession(VALID_ID)))
        .mockResolvedValueOnce(null);

      const sessions = await store.getAllSessions();
      expect(sessions).toHaveLength(1);
    });

    it('should skip keys with invalid JSON', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['k1', 'k2']]);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(makeSession(VALID_ID)))
        .mockResolvedValueOnce('broken{json');

      const sessions = await store.getAllSessions();
      expect(sessions).toHaveLength(1);
    });

    it('should sort sessions by creation date descending', async () => {
      const older = { ...makeSession(VALID_ID), createdAt: '2024-01-01T00:00:00.000Z' };
      const newer = { ...makeSession(VALID_ID_2), createdAt: '2025-06-15T00:00:00.000Z' };

      mockRedis.scan.mockResolvedValueOnce(['0', ['k1', 'k2']]);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(older))
        .mockResolvedValueOnce(JSON.stringify(newer));

      const sessions = await store.getAllSessions();
      expect(sessions[0].sessionId).toBe(VALID_ID_2); // newer first
      expect(sessions[1].sessionId).toBe(VALID_ID);
    });
  });

  // ── getStorageStats() ─────────────────────────────────────────
  describe('getStorageStats()', () => {
    it('should return stats with Redis memory info', async () => {
      const session = makeSession(VALID_ID, [
        { original: 'X', tokenized: 't', type: 'regex', category: 'EMAIL' },
      ]);
      mockRedis.scan.mockResolvedValue(['0', ['k1']]);
      mockRedis.get.mockResolvedValue(JSON.stringify(session));
      mockRedis.info.mockResolvedValueOnce('used_memory_human:1.23M\r\nused_memory:1290000\r\n');

      const stats = await store.getStorageStats();
      expect(stats.sessionCount).toBe(1);
      expect(stats.totalTokens).toBe(1);
      expect(stats.redisConnected).toBe(true);
      expect(stats.memoryUsage).toBe('1.23M');
    });

    it('should handle Redis INFO with no memory match', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);
      mockRedis.info.mockResolvedValueOnce('some_other_info:value\r\n');

      const stats = await store.getStorageStats();
      expect(stats.memoryUsage).toBeUndefined();
    });

    it('should handle Redis INFO error gracefully', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);
      mockRedis.info.mockRejectedValueOnce(new Error('INFO failed'));

      const stats = await store.getStorageStats();
      expect(stats.redisConnected).toBe(true);
      expect(stats.memoryUsage).toBeUndefined();
    });

    it('should skip memory fetch when Redis not ready', async () => {
      mockRedis.status = 'connecting';
      mockRedis.scan.mockResolvedValue(['0', []]);

      const stats = await store.getStorageStats();
      expect(stats.redisConnected).toBe(false);
      expect(stats.memoryUsage).toBeUndefined();
      expect(mockRedis.info).not.toHaveBeenCalled();
    });
  });

  // ── getStats() ────────────────────────────────────────────────
  describe('getStats()', () => {
    it('should report redisConnected true when status is ready', async () => {
      mockRedis.status = 'ready';
      mockRedis.scan.mockResolvedValue(['0', []]);
      const stats = await store.getStats();
      expect(stats.redisConnected).toBe(true);
    });

    it('should report redisConnected true when status is connect', async () => {
      mockRedis.status = 'connect';
      mockRedis.scan.mockResolvedValue(['0', []]);
      const stats = await store.getStats();
      expect(stats.redisConnected).toBe(true);
    });

    it('should report redisConnected false for other statuses', async () => {
      mockRedis.status = 'end';
      mockRedis.scan.mockResolvedValue(['0', []]);
      const stats = await store.getStats();
      expect(stats.redisConnected).toBe(false);
    });
  });

  // ── destroy() ─────────────────────────────────────────────────
  describe('destroy()', () => {
    it('should disconnect Redis and clear cleanup timer', () => {
      store.destroy();
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  // ── cleanupExpired() short-circuits with Redis ────────────────
  describe('cleanupExpired()', () => {
    it('should return early when Redis is connected', () => {
      // Directly invoke cleanupExpired — it should short-circuit because redis exists
      const storeAny = store as any;
      expect(() => storeAny.cleanupExpired()).not.toThrow();
      // No localSessions should be touched
    });
  });

  // ── constructor error handling ────────────────────────────────
  describe('constructor edge cases', () => {
    it('should handle Redis connect() rejection gracefully', async () => {
      mockRedis.connect.mockRejectedValueOnce(new Error('Connection refused'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const s = new RehydrationStore('redis://bad-host:6379');
      // Allow the rejected promise to settle
      await new Promise(r => setTimeout(r, 10));

      expect(warnSpy).toHaveBeenCalledWith('Redis connection failed, using in-memory store');
      s.destroy();
      warnSpy.mockRestore();
    });

    it('should handle Redis constructor throwing synchronously', () => {
      RedisConstructor.mockImplementationOnce(() => { throw new Error('Bad URL'); });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const s = new RehydrationStore('redis://invalid');
      // Should fall back to in-memory without crashing
      expect(warnSpy).toHaveBeenCalledWith(
        'Redis connection failed, using in-memory store:',
        expect.any(Error)
      );

      s.destroy();
      warnSpy.mockRestore();
      // Restore default mock implementation
      RedisConstructor.mockImplementation(() => mockRedis);
    });
  });
});

