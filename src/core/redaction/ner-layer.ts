import nlp from 'compromise';
import type { PIIDetection } from '../types.js';

export interface NERConfig {
  minConfidence: number;
  entityTypes: string[];
}

export interface NERRedactResult {
  text: string;
  tokens: Map<string, string>;
  detections: PIIDetection[];
}

const DEFAULT_NER_CONFIG: NERConfig = {
  minConfidence: 0.5,
  entityTypes: ['Person', 'Organization', 'Place']
};

export class NERLayer {
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

  async redact(text: string): Promise<NERRedactResult> {
    const tokens = new Map<string, string>();
    const detections: PIIDetection[] = [];
    
    const doc = nlp(text);
    
    const people = doc.people().out('array') as string[];
    const orgs = doc.organizations().out('array') as string[];
    const places = doc.places().out('array') as string[];
    
    const entities = [...new Set([...people, ...orgs, ...places])];
    
    let result = text;

    for (const entity of entities) {
      if (!entity || entity.length < 2) continue;
      
      const regex = new RegExp(this.escapePattern(entity), 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const token = this.tokenizer(`NER_${match[0]}`);
        
        if (!tokens.has(token)) {
          tokens.set(token, match[0]);
          
          detections.push({
            type: 'ner',
            category: this.categorizeEntity(entity),
            value: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: this.config.minConfidence + 0.2
          });
        }
      }
    }

    const sortedDetections = detections.sort((a, b) => b.startIndex - a.startIndex);
    
    for (const detection of sortedDetections) {
      const token = [...tokens.entries()].find(([, v]) => v === detection.value)?.[0];
      if (token) {
        const escaped = this.escapePattern(detection.value);
        const regex = new RegExp(escaped, 'gi');
        result = result.replace(regex, token);
      }
    }

    return { text: result, tokens, detections };
  }

  private categorizeEntity(entity: string): string {
    const doc = nlp(entity);
    
    if (doc.people().found) return 'PERSON';
    if (doc.organizations().found) return 'ORG';
    if (doc.places().found) return 'LOCATION';
    return 'ENTITY';
  }

  private escapePattern(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  reset(): void {
    this.counter = 0;
  }
}
