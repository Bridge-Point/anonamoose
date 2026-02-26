import { createRequire } from 'module';
import type { PIIDetection } from '../types.js';

const require = createRequire(import.meta.url);

export interface NamesRedactResult {
  text: string;
  tokens: Map<string, string>;
  detections: PIIDetection[];
}

// Lazy-loaded singleton sets
let nameSet: Set<string> | null = null;
let englishWordSet: Set<string> | null = null;
let wordFreqMap: Map<string, number> | null = null;

function getNameSet(): Set<string> {
  if (!nameSet) {
    const males: string[] = require('datasets-male-first-names-en');
    const females: string[] = require('datasets-female-first-names-en');
    nameSet = new Set<string>();
    for (const name of males) nameSet.add(name.toLowerCase());
    for (const name of females) nameSet.add(name.toLowerCase());
  }
  return nameSet;
}

function getEnglishWordSet(): Set<string> {
  if (!englishWordSet) {
    const words: string[] = require('an-array-of-english-words');
    englishWordSet = new Set<string>(words.map(w => w.toLowerCase()));
  }
  return englishWordSet;
}

function getWordFreqMap(): Map<string, number> {
  if (!wordFreqMap) {
    const subtlex: { word: string; count: number }[] = require('subtlex-word-frequencies');
    wordFreqMap = new Map(subtlex.map(d => [d.word.toLowerCase(), d.count]));
  }
  return wordFreqMap;
}

// Words with frequency below this threshold in the SUBTLEXus corpus (51M words)
// are rare enough as English words that they're more likely names in context.
// e.g. "nick" (3062), "ben" (4994) → likely names
// vs.  "will" (108306), "may" (26080) → likely English words
const RARE_WORD_FREQ_THRESHOLD = 10000;

const MIN_WORD_LENGTH = 3;
const WORD_PATTERN = /\b([A-Za-z][a-zA-Z']+)\b/g;
const SENTENCE_END = /[.?!]\s*$/;

// Common proper nouns that aren't names — the English words dataset omits these
const COMMON_PROPER_NOUNS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'american', 'european', 'african', 'asian', 'australian',
  'english', 'french', 'german', 'spanish', 'chinese', 'japanese', 'italian',
  'christian', 'muslim', 'jewish', 'buddhist', 'hindu',
]);

function isLikelySentenceStart(text: string, matchIndex: number): boolean {
  if (matchIndex === 0) return true;
  const before = text.slice(0, matchIndex).trimEnd();
  if (before.length === 0) return true;
  return SENTENCE_END.test(before);
}

export class NamesLayer {
  private tokenizer: (text: string) => string;
  private counter = 0;

  constructor(tokenizer?: (text: string) => string) {
    this.tokenizer = tokenizer || ((text: string) => {
      const token = `\uE000TOKEN_${this.counter++}\uE001`;
      return token;
    });
  }

  redact(text: string): NamesRedactResult {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    const names = getNameSet();
    const english = getEnglishWordSet();
    const freqs = getWordFreqMap();

    const matches: { value: string; index: number; confidence: number }[] = [];

    let match: RegExpExecArray | null;
    // Reset lastIndex for the global regex
    WORD_PATTERN.lastIndex = 0;

    while ((match = WORD_PATTERN.exec(text)) !== null) {
      const word = match[1];
      if (word.length < MIN_WORD_LENGTH) continue;
      const lower = word.toLowerCase();
      if (COMMON_PROPER_NOUNS.has(lower)) continue;
      const isCapitalized = /^[A-Z]/.test(word);
      const isName = names.has(lower);
      const isEnglish = english.has(lower);
      const sentenceStart = isLikelySentenceStart(text, match.index);

      let confidence: number;

      if (isName && !isEnglish) {
        // Known name, not an English word (e.g. "Jessica" or "jessica")
        confidence = isCapitalized ? 0.85 : 0.65;
      } else if (isName && isEnglish) {
        // Ambiguous — both a name and English word
        const freq = freqs.get(lower) || 0;
        const isRareWord = freq < RARE_WORD_FREQ_THRESHOLD;

        if (isCapitalized) {
          // Capitalized ambiguous: "Rose", "Nick", "Will"
          confidence = isRareWord ? 0.70 : 0.50;
        } else if (isRareWord) {
          // Lowercase but rare English word: "nick", "ben" — more likely a name
          confidence = 0.45;
        } else {
          // Lowercase common English word: "will", "may" — skip
          continue;
        }
      } else if (!isName && !isEnglish) {
        // Unknown word — only detect if capitalized (proper noun signal)
        if (!isCapitalized) continue;
        confidence = 0.7;
      } else {
        // Known English word, not a name — skip
        continue;
      }

      // Sentence-start penalty
      if (sentenceStart) {
        if (!isName) {
          // Unknown word at sentence start — too ambiguous, skip
          continue;
        }
        confidence -= isCapitalized ? 0.15 : 0.20;
      }

      if (confidence > 0) {
        matches.push({ value: word, index: match.index, confidence });
      }
    }

    // Create detections and tokens
    for (const m of matches) {
      const token = this.tokenizer(`NAME_${m.value}`);
      tokens.set(token, m.value);

      detections.push({
        type: 'names',
        category: 'PERSON',
        value: m.value,
        startIndex: m.index,
        endIndex: m.index + m.value.length,
        confidence: m.confidence,
      });
    }

    // Replace right-to-left to preserve indices
    const sortedDetections = detections.sort((a, b) => b.startIndex - a.startIndex);
    let result = text;

    for (const detection of sortedDetections) {
      const token = [...tokens.entries()].find(([, v]) => v === detection.value)?.[0];
      if (token) {
        result =
          result.slice(0, detection.startIndex) +
          token +
          result.slice(detection.endIndex);
      }
    }

    return { text: result, tokens, detections };
  }

  reset(): void {
    this.counter = 0;
  }
}
