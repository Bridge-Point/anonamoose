import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RehydrationStore } from '../../src/core/rehydration/store.js';

describe('RehydrationStore (in-memory)', () => {
  let store: RehydrationStore;

  beforeEach(() => {
    store = new RehydrationStore();
  });

  afterEach(() => {
    store.destroy();
  });

  const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_SESSION_ID_2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('should store and retrieve a session', async () => {
    const tokens = new Map([
      ['\uE000token1\uE001', 'Sarah Johnson'],
      ['\uE000token2\uE001', 'john@example.com'],
    ]);

    await store.store(VALID_SESSION_ID, tokens);
    const session = await store.retrieve(VALID_SESSION_ID);

    expect(session).not.toBeNull();
    expect(session!.sessionId).toBe(VALID_SESSION_ID);
    expect(session!.tokens).toHaveLength(2);
    expect(session!.tokens[0].original).toBe('Sarah Johnson');
    expect(session!.tokens[1].original).toBe('john@example.com');
  });

  it('should return null for non-existent session', async () => {
    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session).toBeNull();
  });

  it('should reject invalid session IDs', async () => {
    const tokens = new Map([['tok', 'val']]);
    await expect(store.store('invalid-id', tokens)).rejects.toThrow('Invalid session ID format');
  });

  it('should return null for invalid session ID on retrieve', async () => {
    const session = await store.retrieve('not-a-uuid');
    expect(session).toBeNull();
  });

  it('should hydrate text by replacing tokens with originals', async () => {
    const tokens = new Map([
      ['\uE000tok1\uE001', 'Auckland'],
      ['\uE000tok2\uE001', '021 555 1234'],
    ]);

    await store.store(VALID_SESSION_ID, tokens);

    const hydrated = await store.hydrate(
      'I live in \uE000tok1\uE001 and my number is \uE000tok2\uE001',
      VALID_SESSION_ID
    );

    expect(hydrated).toBe('I live in Auckland and my number is 021 555 1234');
  });

  it('should return original text when session not found', async () => {
    const text = 'Some text with \uE000tokens\uE001';
    const hydrated = await store.hydrate(text, VALID_SESSION_ID);
    expect(hydrated).toBe(text);
  });

  it('should delete a session', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens);

    const deleted = await store.delete(VALID_SESSION_ID);
    expect(deleted).toBe(true);

    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session).toBeNull();
  });

  it('should return false when deleting non-existent session', async () => {
    const deleted = await store.delete(VALID_SESSION_ID);
    expect(deleted).toBe(false);
  });

  it('should delete all sessions', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens);
    await store.store(VALID_SESSION_ID_2, tokens);

    expect(await store.size()).toBe(2);

    const count = await store.deleteAll();
    expect(count).toBe(2);
    expect(await store.size()).toBe(0);
  });

  it('should extend session TTL', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens, 10);

    const extended = await store.extend(VALID_SESSION_ID, 7200);
    expect(extended).toBe(true);

    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session).not.toBeNull();
  });

  it('should return false when extending non-existent session', async () => {
    const extended = await store.extend(VALID_SESSION_ID, 3600);
    expect(extended).toBe(false);
  });

  it('should deduplicate tokens with same original value', async () => {
    const tokens1 = new Map([['\uE000t1\uE001', 'Sarah']]);
    const tokens2 = new Map([['\uE000t2\uE001', 'Sarah']]);

    await store.store(VALID_SESSION_ID, tokens1);
    await store.store(VALID_SESSION_ID, tokens2);

    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session!.tokens).toHaveLength(1);
  });

  it('should report storage stats', async () => {
    const tokens = new Map([
      ['\uE000t1\uE001', 'Alice'],
      ['\uE000t2\uE001', 'Bob'],
    ]);
    await store.store(VALID_SESSION_ID, tokens);

    const stats = await store.getStorageStats();
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalTokens).toBe(2);
    expect(stats.redisConnected).toBe(false);
  });

  it('should get active session count', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens);

    const stats = await store.getStats();
    expect(stats.activeSessions).toBe(1);
    expect(stats.redisConnected).toBe(false);
  });

  it('should get all sessions sorted by creation date', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens);
    await store.store(VALID_SESSION_ID_2, tokens);

    const sessions = await store.getAllSessions();
    expect(sessions).toHaveLength(2);
  });

  it('should search sessions by token value', async () => {
    const tokens = new Map([
      ['\uE000t1\uE001', 'Melbourne'],
      ['\uE000t2\uE001', 'sarah@test.com'],
    ]);
    await store.store(VALID_SESSION_ID, tokens);

    const results = await store.search('melbourne');
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe(VALID_SESSION_ID);
  });

  it('should expire sessions after TTL', async () => {
    const tokens = new Map([['\uE000t\uE001', 'data']]);
    // Store with 0 seconds TTL (already expired)
    await store.store(VALID_SESSION_ID, tokens, 0);

    // Wait a tick to ensure expiry
    await new Promise(r => setTimeout(r, 10));

    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session).toBeNull();
  });

  it('should return 0 from cleanup (in-memory TTL handled elsewhere)', async () => {
    const count = await store.cleanup();
    expect(count).toBe(0);
  });

  it('should destroy without error', () => {
    const tempStore = new RehydrationStore();
    expect(() => tempStore.destroy()).not.toThrow();
  });

  it('should search by category', async () => {
    const tokens = new Map([['\uE000t1\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens, 3600, 'regex', 'EMAIL');

    const results = await store.search('email');
    expect(results).toHaveLength(1);
  });

  it('should search by meta values', async () => {
    const tokens = new Map([['\uE000t1\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens, 3600, 'regex', 'PII', { source: 'proxy' });

    const results = await store.search('proxy');
    expect(results).toHaveLength(1);
  });

  it('should return empty search for no matches', async () => {
    const tokens = new Map([['\uE000t1\uE001', 'data']]);
    await store.store(VALID_SESSION_ID, tokens);

    const results = await store.search('nonexistent_query_xyz');
    expect(results).toHaveLength(0);
  });

  it('should store with different token types', async () => {
    const tokens = new Map([['\uE000t1\uE001', 'Sarah']]);
    await store.store(VALID_SESSION_ID, tokens, 3600, 'ner', 'PERSON');

    const session = await store.retrieve(VALID_SESSION_ID);
    expect(session!.tokens[0].type).toBe('ner');
    expect(session!.tokens[0].category).toBe('PERSON');
  });

  it('should reject invalid session ID on delete', async () => {
    const result = await store.delete('bad-id');
    expect(result).toBe(false);
  });

  it('should reject invalid session ID on extend', async () => {
    const result = await store.extend('bad-id', 3600);
    expect(result).toBe(false);
  });

  // ── cleanupExpired (in-memory path) ─────────────────────────
  it('should clean up expired sessions when cleanupExpired runs', async () => {
    const storeAny = store as any;

    // Insert an already-expired session directly into localSessions
    storeAny.localSessions.set(VALID_SESSION_ID, {
      sessionId: VALID_SESSION_ID,
      tokens: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      lastAccessedAt: new Date().toISOString(),
    });

    expect(storeAny.localSessions.size).toBe(1);

    // Trigger cleanup
    storeAny.cleanupExpired();

    expect(storeAny.localSessions.size).toBe(0);
  });

  it('should not clean up non-expired sessions', async () => {
    const storeAny = store as any;

    storeAny.localSessions.set(VALID_SESSION_ID, {
      sessionId: VALID_SESSION_ID,
      tokens: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(), // 1hr from now
      lastAccessedAt: new Date().toISOString(),
    });

    storeAny.cleanupExpired();
    expect(storeAny.localSessions.size).toBe(1);
  });

  // ── evictIfNeeded ───────────────────────────────────────────
  it('should evict oldest 10% when at capacity', () => {
    const storeAny = store as any;

    // Manually fill localSessions to MAX_LOCAL_SESSIONS (10000)
    for (let i = 0; i < 10000; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`;
      storeAny.localSessions.set(id, {
        sessionId: id,
        tokens: [],
        createdAt: new Date(Date.now() - (10000 - i) * 1000).toISOString(), // oldest first
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        lastAccessedAt: new Date().toISOString(),
      });
    }

    expect(storeAny.localSessions.size).toBe(10000);

    // Trigger eviction
    storeAny.evictIfNeeded();

    // Should have evicted 10% = 1000 oldest sessions
    expect(storeAny.localSessions.size).toBe(9000);
  });

  it('should not evict when under capacity', () => {
    const storeAny = store as any;

    storeAny.localSessions.set(VALID_SESSION_ID, {
      sessionId: VALID_SESSION_ID,
      tokens: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      lastAccessedAt: new Date().toISOString(),
    });

    storeAny.evictIfNeeded();
    expect(storeAny.localSessions.size).toBe(1);
  });
});
