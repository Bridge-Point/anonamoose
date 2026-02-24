import type { DictionaryEntry, PIIDetection } from '../types.js';

export interface DictionaryRedactResult {
  text: string;
  tokens: Map<string, string>;
  detections: PIIDetection[];
}

export class DictionaryService {
  private entries: Map<string, DictionaryEntry> = new Map();
  private tokenizer: (text: string) => string;

  constructor() {
    this.tokenizer = (text: string) => text;
  }

  setTokenizer(tokenizer: (text: string) => string): void {
    this.tokenizer = tokenizer;
  }

  async add(entries: DictionaryEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.enabled) {
        this.entries.set(entry.id, entry);
      } else {
        this.entries.delete(entry.id);
      }
    }
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.entries.delete(id);
    }
  }

  list(): DictionaryEntry[] {
    return Array.from(this.entries.values());
  }

  async redact(text: string, sessionId: string): Promise<DictionaryRedactResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];

    if (this.entries.size === 0) {
      return { text, tokens, detections };
    }

    let result = text;
    const sortedEntries = Array.from(this.entries.values()).sort((a, b) => b.term.length - a.term.length);

    for (const entry of sortedEntries) {
      const pattern = entry.wholeWord 
        ? `\\b${this.escapePattern(entry.term)}\\b`
        : this.escapePattern(entry.term);
      
      const flags = entry.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      
      result = result.replace(regex, (match, offset) => {
        const token = this.tokenizer(match);

        if (!tokens.has(token)) {
          tokens.set(token, match);

          detections.push({
            type: 'dictionary',
            category: 'CUSTOM_DICTIONARY',
            value: match,
            startIndex: offset,
            endIndex: offset + match.length,
            confidence: 1.0
          });
        }

        return token;
      });
    }

    return { text: result, tokens, detections };
  }

  private escapePattern(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  size(): number {
    return this.entries.size;
  }
}
