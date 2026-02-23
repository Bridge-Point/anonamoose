import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NERLayer } from '../../src/core/redaction/ner-layer.js';

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
});
