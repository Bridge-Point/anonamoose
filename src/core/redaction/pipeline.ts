import type { RedactionConfig, RedactionResult, PIIDetection } from '../types.js';
import { DictionaryService } from './dictionary.js';
import { DEFAULT_PATTERNS } from './regex-layer.js';
import { Tokenizer } from './tokenizer.js';
import { NERLayer } from './ner-layer.js';

export class RedactionPipeline {
  private tokenizer: Tokenizer;
  private nerLayer: NERLayer;

  constructor(
    private dictionary: DictionaryService,
    private config: RedactionConfig
  ) {
    this.tokenizer = new Tokenizer();
    this.nerLayer = new NERLayer({}, (text) => {
      return this.tokenizer.generatePlaceholder();
    });
    
    this.dictionary.setTokenizer((text) => {
      return this.tokenizer.generatePlaceholder();
    });
  }

  async redact(text: string, sessionId: string): Promise<RedactionResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    let result = text;

    // LAYER 1: Dictionary (GUARANTEED - always runs first)
    if (this.config.enableDictionary) {
      const dictResult = await this.dictionary.redact(result, sessionId);
      for (const [token, original] of dictResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...dictResult.detections);
      result = dictResult.text;
    }

    // LAYER 2: Regex (deterministic patterns)
    if (this.config.enableRegex) {
      const regexResult = this.redactRegex(result);
      for (const [token, original] of regexResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...regexResult.detections);
      result = regexResult.text;
    }

    // LAYER 3: NER (probabilistic, context-aware)
    if (this.config.enableNER) {
      const nerResult = await this.nerLayer.redact(result);
      const newDetections = nerResult.detections.filter(
        d => !detections.some(existing => 
          existing.startIndex === d.startIndex && 
          existing.endIndex === d.endIndex
        )
      );
      for (const [token, original] of nerResult.tokens) {
        tokens.set(token, original);
      }
      detections.push(...newDetections);
      result = nerResult.text;
    }

    // Tokenize placeholders if enabled
    if (this.config.tokenizePlaceholders) {
      result = this.tokenizer.tokenize(result, tokens);
    }

    return {
      redactedText: result,
      tokens,
      rehydrationKey: sessionId,
      detectedPII: detections
    };
  }

  private redactRegex(text: string): { text: string; tokens: Map<string, string>; detections: PIIDetection[] } {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    
    for (const pattern of DEFAULT_PATTERNS) {
      const matches = [...text.matchAll(pattern.pattern)];
      
      for (const match of matches) {
        const value = match[0];
        
        if (pattern.validator && !pattern.validator(value)) {
          continue;
        }

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

    const sortedDetections = detections.sort((a, b) => b.startIndex - a.startIndex);
    let result = text;
    
    for (const detection of sortedDetections) {
      const token = [...tokens.entries()].find(([, v]) => v === detection.value)?.[0];
      if (token) {
        const escaped = detection.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        result = result.replace(regex, token);
      }
    }

    return { text: result, tokens, detections };
  }

  getDictionary(): DictionaryService {
    return this.dictionary;
  }
}
