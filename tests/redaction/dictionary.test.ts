import { describe, it, expect } from 'vitest';
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
});
