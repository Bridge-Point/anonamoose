import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/core/database.js';
import { DictionaryService } from '../../src/core/redaction/dictionary.js';

describe('Dictionary Service', () => {
  const makeDictionary = async (terms: { term: string; caseSensitive?: boolean; wholeWord?: boolean }[]) => {
    const dict = new DictionaryService();
    let counter = 0;
    dict.setTokenizer(() => `\uE000DICT_${counter++}\uE001`);
    await dict.add(terms.map((t, i) => ({
      id: `dict-${i}`,
      term: t.term,
      caseSensitive: t.caseSensitive ?? false,
      wholeWord: t.wholeWord ?? false,
      enabled: true,
      createdAt: new Date(),
    })));
    return dict;
  };

  it('should redact a known company name', async () => {
    const dict = await makeDictionary([{ term: 'Acme Corp' }]);
    const result = await dict.redact('I work at Acme Corp in Sydney', 'sess-1');
    expect(result.text).not.toContain('Acme Corp');
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].category).toBe('CUSTOM_DICTIONARY');
    expect(result.detections[0].confidence).toBe(1.0);
  });

  it('should redact case-insensitively by default', async () => {
    const dict = await makeDictionary([{ term: 'Sarah Johnson' }]);
    const result = await dict.redact('Contact sarah johnson about the project', 'sess-1');
    expect(result.text).not.toContain('sarah johnson');
    expect(result.detections).toHaveLength(1);
  });

  it('should respect caseSensitive flag', async () => {
    const dict = await makeDictionary([{ term: 'ProjectX', caseSensitive: true }]);

    const result1 = await dict.redact('Working on ProjectX today', 'sess-1');
    expect(result1.text).not.toContain('ProjectX');
    expect(result1.detections).toHaveLength(1);

    const result2 = await dict.redact('Working on projectx today', 'sess-2');
    expect(result2.text).toContain('projectx');
    expect(result2.detections).toHaveLength(0);
  });

  it('should respect wholeWord flag', async () => {
    const dict = await makeDictionary([{ term: 'Ben', wholeWord: true }]);

    const result1 = await dict.redact('Contact Ben about the project', 'sess-1');
    expect(result1.text).not.toContain('Ben');

    const result2 = await dict.redact('This is a benchmark test', 'sess-2');
    expect(result2.text).toContain('benchmark');
  });

  it('should redact multiple dictionary terms in one text', async () => {
    const dict = await makeDictionary([
      { term: 'Jane Smith' },
      { term: 'Bridge Point Ltd' },
      { term: 'Wellington' },
    ]);
    const result = await dict.redact(
      'Jane Smith works at Bridge Point Ltd in Wellington',
      'sess-1'
    );
    expect(result.text).not.toContain('Jane Smith');
    expect(result.text).not.toContain('Bridge Point Ltd');
    expect(result.text).not.toContain('Wellington');
    expect(result.detections).toHaveLength(3);
  });

  it('should handle overlapping terms (longer match first)', async () => {
    const dict = await makeDictionary([
      { term: 'New Zealand' },
      { term: 'New' },
    ]);
    const result = await dict.redact('Moving to New Zealand next month', 'sess-1');
    expect(result.text).not.toContain('New Zealand');
    // "New Zealand" should be replaced as one token (longer match first)
    expect(result.detections.length).toBeGreaterThanOrEqual(1);
  });

  it('should return token map for rehydration', async () => {
    const dict = await makeDictionary([{ term: 'Top Secret' }]);
    const result = await dict.redact('This is Top Secret information', 'sess-1');
    expect(result.tokens.size).toBe(1);
    const [token, original] = [...result.tokens.entries()][0];
    expect(original).toBe('Top Secret');
    expect(result.text).toContain(token);
  });

  it('should return unmodified text when dictionary is empty', async () => {
    const dict = new DictionaryService();
    const result = await dict.redact('Nothing to redact here', 'sess-1');
    expect(result.text).toBe('Nothing to redact here');
    expect(result.detections).toHaveLength(0);
    expect(result.tokens.size).toBe(0);
  });

  it('should add and remove entries', async () => {
    const dict = new DictionaryService();
    await dict.add([{
      id: 'test-1',
      term: 'Remove Me',
      caseSensitive: false,
      wholeWord: false,
      enabled: true,
      createdAt: new Date(),
    }]);
    expect(dict.size()).toBe(1);

    await dict.remove(['test-1']);
    expect(dict.size()).toBe(0);
  });

  it('should list all entries', async () => {
    const dict = await makeDictionary([
      { term: 'Alpha' },
      { term: 'Bravo' },
      { term: 'Charlie' },
    ]);
    const entries = dict.list();
    expect(entries).toHaveLength(3);
    expect(entries.map(e => e.term)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('should not add disabled entries', async () => {
    const dict = new DictionaryService();
    await dict.add([{
      id: 'disabled-1',
      term: 'Hidden',
      caseSensitive: false,
      wholeWord: false,
      enabled: false,
      createdAt: new Date(),
    }]);
    expect(dict.size()).toBe(0);
  });

  it('should handle special regex characters in terms', async () => {
    const dict = await makeDictionary([{ term: 'price is $100.00' }]);
    const result = await dict.redact('The price is $100.00 for the item', 'sess-1');
    expect(result.text).not.toContain('$100.00');
    expect(result.detections).toHaveLength(1);
  });

  describe('SQLite persistence', () => {
    const makeDb = () => {
      const db = new Database(':memory:');
      initializeSchema(db);
      return db;
    };

    it('should persist entries to SQLite on add', async () => {
      const db = makeDb();
      const dict = new DictionaryService(db);
      await dict.add([{
        id: 'persist-1',
        term: 'Acme Corp',
        caseSensitive: false,
        wholeWord: false,
        enabled: true,
        createdAt: new Date(),
      }]);

      const rows = db.prepare('SELECT * FROM dictionary').all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].term).toBe('Acme Corp');
      db.close();
    });

    it('should load entries from SQLite on construction', async () => {
      const db = makeDb();

      // Insert directly into db
      db.prepare(
        'INSERT INTO dictionary (id, term, case_sensitive, whole_word, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('pre-1', 'Pre-loaded Term', 0, 0, 1, new Date().toISOString());

      const dict = new DictionaryService(db);
      expect(dict.size()).toBe(1);
      expect(dict.list()[0].term).toBe('Pre-loaded Term');
      db.close();
    });

    it('should survive service recreation (simulating restart)', async () => {
      const db = makeDb();

      const dict1 = new DictionaryService(db);
      await dict1.add([
        { id: 'r-1', term: 'Secret Project', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
        { id: 'r-2', term: 'Internal Only', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
      ]);
      expect(dict1.size()).toBe(2);

      // Simulate restart — new service, same db
      const dict2 = new DictionaryService(db);
      expect(dict2.size()).toBe(2);
      expect(dict2.list().map(e => e.term).sort()).toEqual(['Internal Only', 'Secret Project']);
      db.close();
    });

    it('should persist removals to SQLite', async () => {
      const db = makeDb();
      const dict = new DictionaryService(db);
      await dict.add([
        { id: 'rm-1', term: 'Alpha', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
        { id: 'rm-2', term: 'Bravo', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
      ]);
      await dict.remove(['rm-1']);

      const rows = db.prepare('SELECT * FROM dictionary').all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].term).toBe('Bravo');
      db.close();
    });

    it('should persist clear to SQLite', async () => {
      const db = makeDb();
      const dict = new DictionaryService(db);
      await dict.add([
        { id: 'cl-1', term: 'One', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
        { id: 'cl-2', term: 'Two', caseSensitive: false, wholeWord: false, enabled: true, createdAt: new Date() },
      ]);
      await dict.clear();

      expect(dict.size()).toBe(0);
      const rows = db.prepare('SELECT * FROM dictionary').all() as any[];
      expect(rows).toHaveLength(0);
      db.close();
    });

    it('should not load disabled entries from SQLite', async () => {
      const db = makeDb();
      db.prepare(
        'INSERT INTO dictionary (id, term, case_sensitive, whole_word, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('dis-1', 'Disabled Term', 0, 0, 0, new Date().toISOString());

      const dict = new DictionaryService(db);
      expect(dict.size()).toBe(0);
      db.close();
    });
  });

  describe('removeByTerms', () => {
    it('should remove entries by term name', async () => {
      const dict = await makeDictionary([
        { term: 'Alice' },
        { term: 'Bob' },
        { term: 'Charlie' },
      ]);
      const deleted = await dict.removeByTerms(['Alice', 'Charlie']);
      expect(deleted).toEqual(['dict-0', 'dict-2']);
      expect(dict.size()).toBe(1);
      expect(dict.list()[0].term).toBe('Bob');
    });

    it('should match terms case-insensitively', async () => {
      const dict = await makeDictionary([{ term: 'Alice' }]);
      const deleted = await dict.removeByTerms(['alice']);
      expect(deleted).toEqual(['dict-0']);
      expect(dict.size()).toBe(0);
    });

    it('should skip terms that do not exist', async () => {
      const dict = await makeDictionary([{ term: 'Alice' }]);
      const deleted = await dict.removeByTerms(['Bob', 'Charlie']);
      expect(deleted).toEqual([]);
      expect(dict.size()).toBe(1);
    });
  });

  describe('deduplication', () => {
    it('should report existing terms via hasTerm()', async () => {
      const dict = await makeDictionary([{ term: 'Acme Corp' }]);
      expect(dict.hasTerm('Acme Corp')).toBe(true);
      expect(dict.hasTerm('acme corp')).toBe(true);
      expect(dict.hasTerm('Unknown')).toBe(false);
    });

    it('should remove term from index on delete', async () => {
      const dict = new DictionaryService();
      await dict.add([{
        id: 'dup-1', term: 'TestCo', caseSensitive: false,
        wholeWord: false, enabled: true, createdAt: new Date(),
      }]);
      expect(dict.hasTerm('TestCo')).toBe(true);
      await dict.remove(['dup-1']);
      expect(dict.hasTerm('TestCo')).toBe(false);
    });
  });

  describe('performance at scale', () => {
    it('should redact text with 10,000 dictionary entries in under 100ms', async () => {
      const dict = new DictionaryService();
      let counter = 0;
      dict.setTokenizer(() => `\uE000DICT_${counter++}\uE001`);

      // Generate 10k unique names
      const entries = Array.from({ length: 10000 }, (_, i) => ({
        id: `perf-${i}`,
        term: `Person${i} Surname${i}`,
        caseSensitive: false,
        wholeWord: true,
        enabled: true,
        createdAt: new Date(),
      }));
      await dict.add(entries);

      // Text that contains a few of these names
      const text = 'Please contact Person0 Surname0 and Person5000 Surname5000 about the project. Also CC Person9999 Surname9999.';

      const start = performance.now();
      const result = await dict.redact(text, 'perf-session');
      const elapsed = performance.now() - start;

      expect(result.detections).toHaveLength(3);
      expect(result.text).not.toContain('Person0 Surname0');
      expect(result.text).not.toContain('Person5000 Surname5000');
      expect(result.text).not.toContain('Person9999 Surname9999');
      expect(elapsed).toBeLessThan(100);
    });
  });
});
