import type { RedactionConfig, RedactionResult, PIIDetection } from '../types.js';
import { DictionaryService } from './dictionary.js';
import { DEFAULT_PATTERNS } from './regex-layer.js';
import { Tokenizer } from './tokenizer.js';
import { NamesLayer } from './names-layer.js';
import { NERLayer } from './ner-layer.js';

export class RedactionPipeline {
  private tokenizer: Tokenizer;
  private namesLayer: NamesLayer;
  private nerLayer: NERLayer;

  constructor(
    private dictionary: DictionaryService,
    private getConfig: () => RedactionConfig
  ) {
    this.tokenizer = new Tokenizer();
    this.namesLayer = new NamesLayer((text) => {
      return this.tokenizer.generatePlaceholder();
    });
    this.nerLayer = new NERLayer({}, (text) => {
      return this.tokenizer.generatePlaceholder();
    });

    this.dictionary.setTokenizer((text) => {
      return this.tokenizer.generatePlaceholder();
    });
  }

  async redact(text: string, sessionId: string, overrides?: Partial<RedactionConfig>): Promise<RedactionResult> {
    const config = { ...this.getConfig(), ...overrides };
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    let result = text;

    // LAYER 1: Dictionary (GUARANTEED - always runs first)
    if (config.enableDictionary) {
      const dictResult = await this.dictionary.redact(result, sessionId);
      for (const [token, original] of dictResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...dictResult.detections);
      result = dictResult.text;
    }

    // LAYER 2: NER (probabilistic, context-aware — runs early for best accuracy on natural text)
    if (config.enableNER) {
      const nerResult = await this.nerLayer.redact(result, config.nerModel, config.nerMinConfidence);
      const newDetections = nerResult.detections.filter(
        d => !detections.some(existing =>
          existing.value === d.value && existing.category === d.category
        )
      );
      for (const [token, original] of nerResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...newDetections);
      result = nerResult.text;
    }

    // LAYER 3: Regex (deterministic patterns)
    if (config.enableRegex) {
      const regexResult = this.redactRegex(result, config.locale);
      for (const [token, original] of regexResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...regexResult.detections);
      result = regexResult.text;
    }

    // LAYER 4: Names (fast deterministic name detection)
    if (config.enableNames) {
      const namesResult = this.namesLayer.redact(result);
      const newNameDetections = namesResult.detections.filter(
        d => !detections.some(existing =>
          existing.value === d.value && existing.category === d.category
        )
      );
      for (const [token, original] of namesResult.tokens) {
        if (newNameDetections.some(d => d.value === original)) {
          tokens.set(token, original);
        }
      }
      detections.push(...newNameDetections);
      result = namesResult.text;
    }

    // Tokenize placeholders if enabled
    if (config.tokenizePlaceholders) {
      result = this.tokenizer.tokenize(result, tokens);
    }

    return {
      redactedText: result,
      tokens,
      rehydrationKey: sessionId,
      detectedPII: detections
    };
  }

  private redactRegex(text: string, locale?: string | null): { text: string; tokens: Map<string, string>; detections: PIIDetection[] } {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];

    const patterns = locale
      ? DEFAULT_PATTERNS.filter(p => !p.country || p.country.includes(locale))
      : DEFAULT_PATTERNS;

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern.pattern)];

      for (const match of matches) {
        const value = match[0];

        let valid = true;
        if (pattern.validator) {
          try {
            valid = pattern.validator(value);
          } catch {
            valid = false;
          }
        }
        if (!valid) continue;

        const token = this.tokenizer.generatePlaceholder();

        if (!tokens.has(token)) {
          tokens.set(token, value);

          detections.push({
            type: 'regex',
            category: pattern.name,
            value,
            startIndex: match.index!,
            endIndex: match.index! + value.length,
            confidence: pattern.confidence
          });
        }
      }
    }

    // Remove overlapping detections — keep the longest (or highest confidence) match
    const sorted = detections.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);
    const nonOverlapping: PIIDetection[] = [];
    let lastEnd = -1;

    for (const d of sorted) {
      if (d.startIndex >= lastEnd) {
        nonOverlapping.push(d);
        lastEnd = d.endIndex;
      } else if (d.endIndex > lastEnd) {
        // Overlapping but extends further — keep the one already in the list
        // (it started earlier, so it's likely the more complete match)
      }
    }

    // Replace right-to-left to preserve indices
    const replacements = nonOverlapping.sort((a, b) => b.startIndex - a.startIndex);
    let result = text;

    for (const detection of replacements) {
      const token = [...tokens.entries()].find(([, v]) => v === detection.value)?.[0];
      if (token) {
        result =
          result.slice(0, detection.startIndex) +
          token +
          result.slice(detection.endIndex);
      }
    }

    return { text: result, tokens, detections: nonOverlapping };
  }

  getDictionary(): DictionaryService {
    return this.dictionary;
  }
}
