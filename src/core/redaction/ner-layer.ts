import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { PIIDetection } from '../types.js';

// Must be set before any pipeline calls
env.allowRemoteModels = true;
if (process.env.NER_MODEL_CACHE) {
  env.cacheDir = process.env.NER_MODEL_CACHE;
}

export interface NERConfig {
  minConfidence: number;
  entityTypes: string[];
}

export interface NERRedactResult {
  text: string;
  tokens: Map<string, string>;
  detections: PIIDetection[];
}

export interface RawEntity {
  entity: string;
  score: number;
  index: number;
  word: string;
}

export interface MergedEntity {
  category: string;
  word: string;
  score: number;
}

const BIO_CATEGORY_MAP: Record<string, string> = {
  'PER': 'PERSON',
  'ORG': 'ORG',
  'LOC': 'LOCATION',
  'MISC': 'MISC',
};

const DEFAULT_NER_CONFIG: NERConfig = {
  minConfidence: 0.6,
  entityTypes: ['PERSON', 'ORG', 'LOCATION', 'MISC'],
};

export class NERLayer {
  private static pipelineInstance: TokenClassificationPipeline | null = null;
  private static loadFailed = false;
  private static lastLoadAttempt = 0;
  private static readonly RETRY_INTERVAL_MS = 60_000;
  private static readonly MAX_INPUT_LENGTH = 10_000;
  private config: NERConfig;
  private tokenizer: (text: string) => string;
  private counter = 0;

  constructor(config: Partial<NERConfig> = {}, tokenizer?: (text: string) => string) {
    this.config = { ...DEFAULT_NER_CONFIG, ...config };
    this.tokenizer = tokenizer || ((text: string) => {
      const token = `\uE000TOKEN_${this.counter++}\uE001`;
      return token;
    });
  }

  private static async getPipeline(): Promise<TokenClassificationPipeline | null> {
    if (this.pipelineInstance) return this.pipelineInstance;

    if (this.loadFailed && Date.now() - this.lastLoadAttempt < this.RETRY_INTERVAL_MS) {
      return null;
    }

    try {
      this.lastLoadAttempt = Date.now();
      this.pipelineInstance = await pipeline(
        'token-classification',
        'Xenova/bert-base-NER',
        { dtype: 'q8' }
      ) as TokenClassificationPipeline;
      this.loadFailed = false;
      return this.pipelineInstance;
    } catch (err) {
      console.error('NER model load failed:', err);
      this.loadFailed = true;
      return null;
    }
  }

  async redact(text: string): Promise<NERRedactResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];

    if (text.length > NERLayer.MAX_INPUT_LENGTH) {
      return { text, tokens, detections };
    }

    const ner = await NERLayer.getPipeline();
    if (!ner) {
      return { text, tokens, detections };
    }
    const rawEntities = await ner(text, { ignore_labels: [] }) as RawEntity[];

    // Filter to B-/I- tags only (skip 'O' labels)
    const bioEntities = rawEntities.filter(
      (e) => e.entity.startsWith('B-') || e.entity.startsWith('I-')
    );

    // Merge subword tokens into full entity spans
    const merged = NERLayer.mergeEntities(bioEntities);

    // Deduplicate entity words
    const uniqueEntities = [...new Map(merged.map(e => [e.word, e])).values()];

    // Filter by confidence and allowed entity types
    const filtered = uniqueEntities.filter(
      (e) =>
        e.score >= this.config.minConfidence &&
        this.config.entityTypes.includes(e.category)
    );

    let result = text;

    // Find each entity in the text and replace it
    for (const entity of filtered) {
      if (!entity.word || entity.word.length < 2) continue;

      const escaped = entity.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        const token = this.tokenizer(`NER_${match[0]}`);

        if (!tokens.has(token)) {
          tokens.set(token, match[0]);

          detections.push({
            type: 'ner',
            category: entity.category,
            value: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: entity.score,
          });
        }
      }
    }

    // Replace entities in text (process right-to-left to preserve indices)
    const sortedDetections = detections.sort((a, b) => b.startIndex - a.startIndex);

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

  /** @internal Exposed as static for testing */
  static mergeEntities(entities: RawEntity[]): MergedEntity[] {
    const merged: MergedEntity[] = [];

    for (const entity of entities) {
      const tag = entity.entity.slice(0, 2); // 'B-' or 'I-'
      const label = entity.entity.slice(2);  // 'PER', 'ORG', 'LOC', 'MISC'
      const category = BIO_CATEGORY_MAP[label] || label;

      if (tag === 'B-') {
        // Start a new entity
        merged.push({
          category,
          word: entity.word,
          score: entity.score,
        });
      } else if (tag === 'I-' && merged.length > 0) {
        const last = merged[merged.length - 1];
        // Continue the current entity if same category
        if (last.category === category) {
          // Handle WordPiece subword tokens (## prefix)
          if (entity.word.startsWith('##')) {
            last.word += entity.word.slice(2);
          } else {
            last.word += ' ' + entity.word;
          }
          // Average the confidence scores
          last.score = (last.score + entity.score) / 2;
        } else {
          // Different category I- tag without matching B- — treat as new entity
          merged.push({
            category,
            word: entity.word,
            score: entity.score,
          });
        }
      }
    }

    return merged;
  }

  reset(): void {
    this.counter = 0;
  }

  /** Reset the singleton pipeline (for testing) */
  static resetPipeline(): void {
    this.pipelineInstance = null;
    this.loadFailed = false;
    this.lastLoadAttempt = 0;
  }
}
