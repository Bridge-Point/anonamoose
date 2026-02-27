import type { DictionaryEntry, PIIDetection } from '../types.js';
import type { SqliteDatabase } from '../database.js';

export interface DictionaryRedactResult {
  text: string;
  tokens: Map<string, string>;
  detections: PIIDetection[];
}

export class DictionaryService {
  private entries: Map<string, DictionaryEntry> = new Map();
  private termIndex: Map<string, string> = new Map(); // lowercase term -> id (for dedup)
  private tokenizer: (text: string) => string;
  private dirty = true;
  private db: SqliteDatabase | null;

  // Hash-map index keyed by term length, then by lowercased term
  private buckets: Map<number, Map<string, DictionaryEntry>> = new Map();
  private sortedLengths: number[] = [];

  constructor(db?: SqliteDatabase) {
    this.tokenizer = (text: string) => text;
    this.db = db || null;

    if (this.db) {
      this.loadFromDb();
    }
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT * FROM dictionary WHERE enabled = 1').all() as any[];
    for (const row of rows) {
      const entry: DictionaryEntry = {
        id: row.id,
        term: row.term,
        replacement: row.replacement || undefined,
        caseSensitive: row.case_sensitive === 1,
        wholeWord: row.whole_word === 1,
        enabled: row.enabled === 1,
        createdAt: new Date(row.created_at),
      };
      this.entries.set(row.id, entry);
      this.termIndex.set(row.term.toLowerCase(), row.id);
    }
    this.dirty = true;
  }

  setTokenizer(tokenizer: (text: string) => string): void {
    this.tokenizer = tokenizer;
  }

  hasTerm(term: string): boolean {
    return this.termIndex.has(term.toLowerCase());
  }

  async add(entries: DictionaryEntry[]): Promise<void> {
    if (this.db) {
      const stmt = this.db.prepare(
        `INSERT INTO dictionary (id, term, replacement, case_sensitive, whole_word, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           term = excluded.term,
           replacement = excluded.replacement,
           case_sensitive = excluded.case_sensitive,
           whole_word = excluded.whole_word,
           enabled = excluded.enabled`
      );
      const insertAll = this.db.transaction(() => {
        for (const entry of entries) {
          stmt.run(
            entry.id,
            entry.term,
            entry.replacement || null,
            entry.caseSensitive ? 1 : 0,
            entry.wholeWord ? 1 : 0,
            entry.enabled ? 1 : 0,
            entry.createdAt.toISOString()
          );
        }
      });
      insertAll();
    }

    for (const entry of entries) {
      if (entry.enabled) {
        this.entries.set(entry.id, entry);
        this.termIndex.set(entry.term.toLowerCase(), entry.id);
      } else {
        const existing = this.entries.get(entry.id);
        if (existing) this.termIndex.delete(existing.term.toLowerCase());
        this.entries.delete(entry.id);
      }
    }
    this.dirty = true;
  }

  async removeByTerms(terms: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const term of terms) {
      const id = this.termIndex.get(term.toLowerCase());
      if (id) ids.push(id);
    }
    if (ids.length > 0) await this.remove(ids);
    return ids;
  }

  async remove(ids: string[]): Promise<void> {
    if (this.db && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM dictionary WHERE id IN (${placeholders})`).run(...ids);
    }

    for (const id of ids) {
      const existing = this.entries.get(id);
      if (existing) this.termIndex.delete(existing.term.toLowerCase());
      this.entries.delete(id);
    }
    this.dirty = true;
  }

  async clear(): Promise<void> {
    if (this.db) {
      this.db.prepare('DELETE FROM dictionary').run();
    }
    this.entries.clear();
    this.termIndex.clear();
    this.dirty = true;
  }

  list(): DictionaryEntry[] {
    return Array.from(this.entries.values());
  }

  private buildIndex(): void {
    if (!this.dirty) return;

    this.buckets.clear();

    for (const entry of this.entries.values()) {
      const key = entry.term.toLowerCase();
      const len = key.length;

      let bucket = this.buckets.get(len);
      if (!bucket) {
        bucket = new Map();
        this.buckets.set(len, bucket);
      }
      bucket.set(key, entry);
    }

    // Sort lengths descending so longest match wins
    this.sortedLengths = [...this.buckets.keys()].sort((a, b) => b - a);
    this.dirty = false;
  }

  private isWordBoundary(text: string, index: number): boolean {
    if (index <= 0 || index >= text.length) return true;
    const ch = text[index];
    const isWord = /\w/.test(ch);
    const prevIsWord = /\w/.test(text[index - 1]);
    return isWord !== prevIsWord;
  }

  async redact(text: string, sessionId: string): Promise<DictionaryRedactResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];

    if (this.entries.size === 0) {
      return { text, tokens, detections };
    }

    this.buildIndex();

    // Scan text left-to-right. At each position, check longest lengths first.
    const matches: { start: number; end: number; entry: DictionaryEntry; matched: string }[] = [];
    const textLower = text.toLowerCase();
    let skipUntil = 0;

    for (let i = 0; i < text.length; i++) {
      if (i < skipUntil) continue;

      for (const len of this.sortedLengths) {
        if (i + len > text.length) continue;

        const substr = textLower.slice(i, i + len);
        const bucket = this.buckets.get(len)!;
        const entry = bucket.get(substr);

        if (!entry) continue;

        // Case-sensitive check: verify original text matches exactly
        if (entry.caseSensitive && text.slice(i, i + len) !== entry.term) continue;

        // Whole-word boundary check
        if (entry.wholeWord) {
          if (!this.isWordBoundary(text, i) || !this.isWordBoundary(text, i + len)) continue;
        }

        const matched = text.slice(i, i + len);
        matches.push({ start: i, end: i + len, entry, matched });
        skipUntil = i + len; // skip past this match
        break; // longest match found at this position
      }
    }

    if (matches.length === 0) {
      return { text, tokens, detections };
    }

    // Apply replacements back-to-front so indices remain valid
    let result = text;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const token = this.tokenizer(m.matched);
      tokens.set(token, m.matched);

      detections.push({
        type: 'dictionary',
        category: 'CUSTOM_DICTIONARY',
        value: m.matched,
        startIndex: m.start,
        endIndex: m.end,
        confidence: 1.0,
      });

      result = result.slice(0, m.start) + token + result.slice(m.end);
    }

    return { text: result, tokens, detections };
  }

  size(): number {
    return this.entries.size;
  }
}
