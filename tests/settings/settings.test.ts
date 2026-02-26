import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema, getSetting, setSetting, getAllSettings } from '../../src/core/database.js';

describe('Settings (SQLite)', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should seed default settings on initialization', () => {
    const settings = getAllSettings(db);
    expect(settings.enableDictionary).toBe(true);
    expect(settings.enableRegex).toBe(true);
    expect(settings.enableNames).toBe(true);
    expect(settings.enableNER).toBe(true);
    expect(settings.nerModel).toBe('Xenova/bert-base-NER');
    expect(settings.nerMinConfidence).toBe(0.6);
    expect(settings.tokenizePlaceholders).toBe(true);
    expect(settings.placeholderPrefix).toBe('\uE000');
    expect(settings.placeholderSuffix).toBe('\uE001');
  });

  it('should get a single setting', () => {
    const value = getSetting(db, 'nerModel');
    expect(value).toBe('Xenova/bert-base-NER');
  });

  it('should return undefined for non-existent setting', () => {
    const value = getSetting(db, 'nonexistent');
    expect(value).toBeUndefined();
  });

  it('should update an existing setting', () => {
    setSetting(db, 'nerModel', 'Xenova/distilbert-NER');
    const value = getSetting(db, 'nerModel');
    expect(value).toBe('Xenova/distilbert-NER');
  });

  it('should create a new setting', () => {
    setSetting(db, 'customKey', 'customValue');
    const value = getSetting(db, 'customKey');
    expect(value).toBe('customValue');
  });

  it('should handle boolean settings', () => {
    setSetting(db, 'enableNER', false);
    expect(getSetting(db, 'enableNER')).toBe(false);

    setSetting(db, 'enableNER', true);
    expect(getSetting(db, 'enableNER')).toBe(true);
  });

  it('should handle numeric settings', () => {
    setSetting(db, 'nerMinConfidence', 0.8);
    expect(getSetting(db, 'nerMinConfidence')).toBe(0.8);
  });

  it('should persist changes across getAllSettings calls', () => {
    setSetting(db, 'nerModel', 'new-model');
    const settings = getAllSettings(db);
    expect(settings.nerModel).toBe('new-model');
    expect(settings.enableDictionary).toBe(true); // unchanged
  });

  it('should not overwrite existing settings on re-initialization', () => {
    setSetting(db, 'nerModel', 'custom-model');
    initializeSchema(db); // re-init should not reset
    expect(getSetting(db, 'nerModel')).toBe('custom-model');
  });

  it('should return all default settings', () => {
    const settings = getAllSettings(db);
    expect(Object.keys(settings)).toHaveLength(9);
    expect(Object.keys(settings)).toContain('enableDictionary');
    expect(Object.keys(settings)).toContain('enableRegex');
    expect(Object.keys(settings)).toContain('enableNames');
    expect(Object.keys(settings)).toContain('enableNER');
    expect(Object.keys(settings)).toContain('nerModel');
    expect(Object.keys(settings)).toContain('nerMinConfidence');
    expect(Object.keys(settings)).toContain('tokenizePlaceholders');
    expect(Object.keys(settings)).toContain('placeholderPrefix');
    expect(Object.keys(settings)).toContain('placeholderSuffix');
  });

  it('should store complex JSON values', () => {
    setSetting(db, 'customList', [1, 2, 3]);
    expect(getSetting(db, 'customList')).toEqual([1, 2, 3]);

    setSetting(db, 'customObj', { a: 1, b: 'two' });
    expect(getSetting(db, 'customObj')).toEqual({ a: 1, b: 'two' });
  });

  it('should update the updated_at timestamp on change', () => {
    const before = db.prepare('SELECT updated_at FROM settings WHERE key = ?').get('nerModel') as { updated_at: string };

    // Small delay to ensure different timestamp
    const originalDate = new Date(before.updated_at);

    setSetting(db, 'nerModel', 'different');

    const after = db.prepare('SELECT updated_at FROM settings WHERE key = ?').get('nerModel') as { updated_at: string };
    const updatedDate = new Date(after.updated_at);

    expect(updatedDate.getTime()).toBeGreaterThanOrEqual(originalDate.getTime());
  });
});
