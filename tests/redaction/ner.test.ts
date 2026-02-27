import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NERLayer } from '../../src/core/redaction/ner-layer.js';
import type { RawEntity } from '../../src/core/redaction/ner-layer.js';

describe('NER Layer (Transformer)', () => {
  let nerLayer: NERLayer;

  beforeAll(() => {
    nerLayer = new NERLayer({ minConfidence: 0.5 });
  });

  afterAll(() => {
    NERLayer.resetPipeline();
  });

  it('should detect person names', async () => {
    const result = await nerLayer.redact('My name is Sarah Johnson');

    expect(result.text).not.toContain('Sarah Johnson');
    const personDetections = result.detections.filter(d => d.category === 'PERSON');
    expect(personDetections.length).toBeGreaterThanOrEqual(1);
    expect(personDetections[0].confidence).toBeGreaterThan(0);
    expect(personDetections[0].confidence).toBeLessThanOrEqual(1);
    expect(personDetections[0].type).toBe('ner');
  }, 60000);

  it('should detect organizations', async () => {
    const result = await nerLayer.redact('I work at Google');

    expect(result.text).not.toContain('Google');
    const orgDetections = result.detections.filter(d => d.category === 'ORG');
    expect(orgDetections.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should detect locations', async () => {
    const result = await nerLayer.redact('I live in London');

    expect(result.text).not.toContain('London');
    const locDetections = result.detections.filter(d => d.category === 'LOCATION');
    expect(locDetections.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should detect multiple entity types in one sentence', async () => {
    const result = await nerLayer.redact(
      'John Smith works at Microsoft in Seattle'
    );

    expect(result.text).not.toContain('John Smith');
    expect(result.text).not.toContain('Microsoft');
    expect(result.text).not.toContain('Seattle');

    const categories = new Set(result.detections.map(d => d.category));
    expect(categories.has('PERSON')).toBe(true);
    expect(categories.has('ORG')).toBe(true);
    expect(categories.has('LOCATION')).toBe(true);
  }, 30000);

  it('should provide real confidence scores between 0 and 1', async () => {
    const result = await nerLayer.redact('Barack Obama visited Paris');

    for (const detection of result.detections) {
      expect(detection.confidence).toBeGreaterThan(0);
      expect(detection.confidence).toBeLessThanOrEqual(1);
    }
  }, 30000);

  it('should filter entities below minimum confidence', async () => {
    const strictLayer = new NERLayer({ minConfidence: 0.99 });
    const result = await strictLayer.redact('I met someone in a city');

    // With extremely high threshold, most or all entities should be filtered
    expect(result.detections.length).toBe(0);
  }, 30000);

  it('should store correct token mappings for rehydration', async () => {
    const result = await nerLayer.redact('Contact Sarah at Google');

    for (const [token, original] of result.tokens) {
      expect(token).toContain('\uE000');
      expect(token).toContain('\uE001');
      expect(original.length).toBeGreaterThan(0);
      expect(result.text).toContain(token);
    }
  }, 30000);

  it('should handle text with no entities', async () => {
    const result = await nerLayer.redact('The quick brown fox jumps over the lazy dog');

    expect(result.detections.length).toBe(0);
    expect(result.tokens.size).toBe(0);
    expect(result.text).toBe('The quick brown fox jumps over the lazy dog');
  }, 30000);

  it('should handle long text via chunking instead of skipping', async () => {
    // Build text longer than CHUNK_SIZE (1000 chars) with a name at the end
    const padding = 'The quick brown fox jumps over the lazy dog. '.repeat(30); // ~1350 chars
    const longText = padding + 'Please contact Sarah Johnson about this matter.';
    expect(longText.length).toBeGreaterThan(1000);

    const result = await nerLayer.redact(longText);

    // Should still detect the name even though it's past the chunk boundary
    const personDetections = result.detections.filter(d => d.category === 'PERSON');
    expect(personDetections.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should reset internal counter', () => {
    const layer = new NERLayer();
    layer.reset();
    expect(() => layer.reset()).not.toThrow();
  });

  it('should return unmodified text when pipeline is unavailable (circuit breaker)', async () => {
    // Save current state
    const origPipeline = (NERLayer as any).pipelineInstance;
    const origFailed = (NERLayer as any).loadFailed;
    const origLastAttempt = (NERLayer as any).lastLoadAttempt;

    try {
      // Simulate a recent load failure (circuit breaker open)
      (NERLayer as any).pipelineInstance = null;
      (NERLayer as any).loadFailed = true;
      (NERLayer as any).lastLoadAttempt = Date.now();

      const layer = new NERLayer({ minConfidence: 0.5 });
      const result = await layer.redact('John Smith works at Google');

      // Should return text unmodified since pipeline is unavailable
      expect(result.text).toBe('John Smith works at Google');
      expect(result.detections).toHaveLength(0);
      expect(result.tokens.size).toBe(0);
    } finally {
      // Restore state
      (NERLayer as any).pipelineInstance = origPipeline;
      (NERLayer as any).loadFailed = origFailed;
      (NERLayer as any).lastLoadAttempt = origLastAttempt;
    }
  });
});

describe('NER chunkText (unit)', () => {
  it('should return single chunk for short text', () => {
    const chunks = NERLayer.chunkText('Hello world', 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ chunk: 'Hello world', offset: 0 });
  });

  it('should split long text into overlapping chunks', () => {
    const text = 'A'.repeat(2000);
    const chunks = NERLayer.chunkText(text, 1000, 200);

    // 2000 chars, chunk size 1000, overlap 200 → step 800
    // Chunk 0: [0, 1000), Chunk 1: [800, 1800), Chunk 2: [1600, 2000)
    expect(chunks).toHaveLength(3);
    expect(chunks[0].offset).toBe(0);
    expect(chunks[0].chunk.length).toBe(1000);
    expect(chunks[1].offset).toBe(800);
    expect(chunks[1].chunk.length).toBe(1000);
    expect(chunks[2].offset).toBe(1600);
    expect(chunks[2].chunk.length).toBe(400);
  });

  it('should cover the entire text with no gaps', () => {
    const text = 'X'.repeat(3500);
    const chunks = NERLayer.chunkText(text, 1000, 200);

    // Every character position should be covered by at least one chunk
    const covered = new Set<number>();
    for (const { offset, chunk } of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        covered.add(offset + i);
      }
    }
    expect(covered.size).toBe(3500);
  });

  it('should have overlap between adjacent chunks', () => {
    const text = 'B'.repeat(2500);
    const chunks = NERLayer.chunkText(text, 1000, 200);

    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].offset + chunks[i - 1].chunk.length;
      const currStart = chunks[i].offset;
      // Current chunk should start before previous chunk ends (overlap)
      expect(currStart).toBeLessThan(prevEnd);
    }
  });

  it('should handle text exactly at chunk size boundary', () => {
    const text = 'C'.repeat(1000);
    const chunks = NERLayer.chunkText(text, 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunk).toBe(text);
  });
});

describe('NER mergeEntities (unit)', () => {
  it('should merge B- followed by same-category I- tokens', () => {
    const entities: RawEntity[] = [
      { entity: 'B-PER', score: 0.95, index: 1, word: 'Sarah' },
      { entity: 'I-PER', score: 0.90, index: 2, word: 'Johnson' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged).toHaveLength(1);
    expect(merged[0].word).toBe('Sarah Johnson');
    expect(merged[0].category).toBe('PERSON');
    expect(merged[0].score).toBeCloseTo(0.925);
  });

  it('should merge WordPiece subword tokens (## prefix)', () => {
    const entities: RawEntity[] = [
      { entity: 'B-PER', score: 0.92, index: 1, word: 'Wolf' },
      { entity: 'I-PER', score: 0.88, index: 2, word: '##gang' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged).toHaveLength(1);
    expect(merged[0].word).toBe('Wolfgang');
  });

  it('should start new entity on category mismatch I- tag', () => {
    const entities: RawEntity[] = [
      { entity: 'B-PER', score: 0.95, index: 1, word: 'John' },
      { entity: 'I-ORG', score: 0.85, index: 2, word: 'Corp' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged).toHaveLength(2);
    expect(merged[0].category).toBe('PERSON');
    expect(merged[0].word).toBe('John');
    expect(merged[1].category).toBe('ORG');
    expect(merged[1].word).toBe('Corp');
  });

  it('should handle multiple separate entities', () => {
    const entities: RawEntity[] = [
      { entity: 'B-PER', score: 0.95, index: 1, word: 'Alice' },
      { entity: 'B-LOC', score: 0.90, index: 3, word: 'London' },
      { entity: 'B-ORG', score: 0.88, index: 5, word: 'Google' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged).toHaveLength(3);
    expect(merged[0].category).toBe('PERSON');
    expect(merged[1].category).toBe('LOCATION');
    expect(merged[2].category).toBe('ORG');
  });

  it('should ignore orphan I- tag with no preceding entity', () => {
    const entities: RawEntity[] = [
      { entity: 'I-PER', score: 0.90, index: 1, word: 'Smith' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged).toHaveLength(0);
  });

  it('should handle empty input', () => {
    const merged = NERLayer.mergeEntities([]);
    expect(merged).toHaveLength(0);
  });

  it('should map BIO labels to categories', () => {
    const entities: RawEntity[] = [
      { entity: 'B-PER', score: 0.9, index: 1, word: 'Alice' },
      { entity: 'B-ORG', score: 0.9, index: 2, word: 'Acme' },
      { entity: 'B-LOC', score: 0.9, index: 3, word: 'Paris' },
      { entity: 'B-MISC', score: 0.9, index: 4, word: 'French' },
    ];
    const merged = NERLayer.mergeEntities(entities);
    expect(merged.map(m => m.category)).toEqual(['PERSON', 'ORG', 'LOCATION', 'MISC']);
  });
});
