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
  private static currentModel: string | null = null;
  private static loadFailed = false;
  private static lastLoadAttempt = 0;
  private static readonly RETRY_INTERVAL_MS = 60_000;
  private static readonly CHUNK_SIZE = 1_000;
  private static readonly CHUNK_OVERLAP = 200;
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

  private static async getPipeline(modelName?: string): Promise<TokenClassificationPipeline | null> {
    const model = modelName || 'Xenova/bert-base-NER';

    // If model changed, reset and reload
    if (this.pipelineInstance && this.currentModel !== model) {
      this.pipelineInstance = null;
      this.loadFailed = false;
      this.lastLoadAttempt = 0;
    }

    if (this.pipelineInstance) return this.pipelineInstance;

    if (this.loadFailed && Date.now() - this.lastLoadAttempt < this.RETRY_INTERVAL_MS) {
      return null;
    }

    try {
      this.lastLoadAttempt = Date.now();
      this.pipelineInstance = await pipeline(
        'token-classification',
        model,
        { dtype: 'q8' }
      ) as TokenClassificationPipeline;
      this.loadFailed = false;
      this.currentModel = model;
      return this.pipelineInstance;
    } catch (err) {
      console.error('NER model load failed:', err);
      this.loadFailed = true;
      return null;
    }
  }

  async redact(text: string, modelName?: string, minConfidence?: number): Promise<NERRedactResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    const confidence = minConfidence ?? this.config.minConfidence;

    const ner = await NERLayer.getPipeline(modelName);
    if (!ner) {
      return { text, tokens, detections };
    }

    // Chunk text to stay within BERT's ~512 token context window
    const chunks = NERLayer.chunkText(text, NERLayer.CHUNK_SIZE, NERLayer.CHUNK_OVERLAP);
    const allMerged: MergedEntity[] = [];

    for (const { chunk } of chunks) {
      const rawEntities = await ner(chunk, { ignore_labels: [] }) as RawEntity[];

      // Filter to B-/I- tags only (skip 'O' labels)
      const bioEntities = rawEntities.filter(
        (e) => e.entity.startsWith('B-') || e.entity.startsWith('I-')
      );

      // Merge subword tokens into full entity spans
      allMerged.push(...NERLayer.mergeEntities(bioEntities));
    }

    // Deduplicate entity words across chunks (overlap zone may detect the same entity twice)
    const uniqueEntities = [...new Map(allMerged.map(e => [e.word, e])).values()];

    // Filter by confidence and allowed entity types
    const filtered = uniqueEntities.filter(
      (e) =>
        e.score >= confidence &&
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

    // Remove overlapping detections — keep the longest match
    const sorted = detections.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);
    const nonOverlapping: PIIDetection[] = [];
    let lastEnd = -1;

    for (const d of sorted) {
      if (d.startIndex >= lastEnd) {
        nonOverlapping.push(d);
        lastEnd = d.endIndex;
      }
    }

    // Replace right-to-left to preserve indices
    const replacements = nonOverlapping.sort((a, b) => b.startIndex - a.startIndex);

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

  /** @internal Split text into overlapping chunks for NER processing */
  static chunkText(text: string, chunkSize: number, overlap: number): { chunk: string; offset: number }[] {
    if (text.length <= chunkSize) {
      return [{ chunk: text, offset: 0 }];
    }

    const chunks: { chunk: string; offset: number }[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({ chunk: text.slice(start, end), offset: start });

      if (end >= text.length) break;
      start += chunkSize - overlap;
    }

    return chunks;
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
    this.currentModel = null;
  }
}
