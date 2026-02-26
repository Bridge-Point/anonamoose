import { describe, it, expect } from 'vitest';
import { NamesLayer } from '../../src/core/redaction/names-layer.js';

describe('NamesLayer', () => {
  const createLayer = () => new NamesLayer();

  describe('High confidence names (in name list, not English word)', () => {
    it('should detect "Jessica" with high confidence', () => {
      const layer = createLayer();
      const result = layer.redact('My friend Jessica called me');
      expect(result.text).not.toContain('Jessica');
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].value).toBe('Jessica');
      expect(result.detections[0].confidence).toBe(0.85);
      expect(result.detections[0].type).toBe('names');
      expect(result.detections[0].category).toBe('PERSON');
    });

    it('should detect multiple names', () => {
      const layer = createLayer();
      const result = layer.redact('I spoke with Jennifer and Brandon today');
      expect(result.text).not.toContain('Jennifer');
      expect(result.text).not.toContain('Brandon');
      expect(result.detections).toHaveLength(2);
    });
  });

  describe('Ambiguous names — common English word (freq >= 10000)', () => {
    it('should detect capitalized "Will" with 0.50 confidence', () => {
      const layer = createLayer();
      const result = layer.redact('I told Will about the meeting');
      const detection = result.detections.find(d => d.value === 'Will');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.50);
    });

    it('should skip lowercase common ambiguous name "will"', () => {
      const layer = createLayer();
      const result = layer.redact('i will go to the store');
      expect(result.detections.find(d => d.value === 'will')).toBeUndefined();
    });
  });

  describe('Ambiguous names — rare English word (freq < 10000)', () => {
    it('should detect capitalized "Nick" with 0.70 confidence', () => {
      const layer = createLayer();
      const result = layer.redact('Tell Nick about the meeting');
      const detection = result.detections.find(d => d.value === 'Nick');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.70);
    });

    it('should detect lowercase "nick" with 0.45 confidence', () => {
      const layer = createLayer();
      const result = layer.redact('tell nick about the meeting');
      const detection = result.detections.find(d => d.value === 'nick');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.45);
    });

    it('should detect lowercase "ben" with 0.45 confidence', () => {
      const layer = createLayer();
      const result = layer.redact('ask ben to come over');
      const detection = result.detections.find(d => d.value === 'ben');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.45);
    });

    it('should apply sentence-start penalty to lowercase rare ambiguous name', () => {
      const layer = createLayer();
      const result = layer.redact('nick went to the store');
      const detection = result.detections.find(d => d.value === 'nick');
      expect(detection).toBeDefined();
      // 0.45 - 0.20 = 0.25
      expect(detection!.confidence).toBe(0.25);
    });
  });

  describe('Unknown proper nouns (not in name list, not English word)', () => {
    it('should detect unknown capitalized word with medium confidence', () => {
      const layer = createLayer();
      const result = layer.redact('I spoke to Xylanthria yesterday');
      const detection = result.detections.find(d => d.value === 'Xylanthria');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.7);
    });
  });

  describe('English words (not names) — should be skipped', () => {
    it('should skip common English words like "Monday"', () => {
      const layer = createLayer();
      const result = layer.redact('We meet on Monday');
      expect(result.detections.find(d => d.value === 'Monday')).toBeUndefined();
    });

    it('should skip "The" at sentence start', () => {
      const layer = createLayer();
      const result = layer.redact('The quick brown fox');
      expect(result.detections.find(d => d.value === 'The')).toBeUndefined();
    });

    it('should skip common words like "January"', () => {
      const layer = createLayer();
      const result = layer.redact('In January we launched');
      expect(result.detections.find(d => d.value === 'January')).toBeUndefined();
    });
  });

  describe('Lowercase words', () => {
    it('should detect lowercase known name (not English word) with 0.65 confidence', () => {
      const layer = createLayer();
      const result = layer.redact('she said jessica was coming');
      const detection = result.detections.find(d => d.value === 'jessica');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.65);
    });

    it('should skip lowercase common ambiguous name (high frequency English word)', () => {
      const layer = createLayer();
      const result = layer.redact('i will go now');
      expect(result.detections.find(d => d.value === 'will')).toBeUndefined();
    });

    it('should skip lowercase common English word', () => {
      const layer = createLayer();
      const result = layer.redact('she said hello yesterday');
      expect(result.detections.find(d => d.value === 'hello')).toBeUndefined();
      expect(result.detections.find(d => d.value === 'yesterday')).toBeUndefined();
    });

    it('should skip lowercase unknown word (not name, not English)', () => {
      const layer = createLayer();
      const result = layer.redact('she went to xylanthria today');
      expect(result.detections.find(d => d.value === 'xylanthria')).toBeUndefined();
    });

    it('should replace lowercase detected names with tokens', () => {
      const layer = createLayer();
      const result = layer.redact('tell jessica about it');
      expect(result.text).not.toContain('jessica');
      expect(result.tokens.size).toBe(1);
      const values = [...result.tokens.values()];
      expect(values).toContain('jessica');
    });
  });

  describe('Sentence-start penalty', () => {
    it('should reduce confidence for names at sentence start', () => {
      const layer = createLayer();
      const result = layer.redact('Jessica went to the store');
      const detection = result.detections.find(d => d.value === 'Jessica');
      expect(detection).toBeDefined();
      // 0.85 - 0.15 = 0.70
      expect(detection!.confidence).toBe(0.70);
    });

    it('should reduce confidence for names after period', () => {
      const layer = createLayer();
      const result = layer.redact('Hello there. Jessica went home.');
      const detection = result.detections.find(d => d.value === 'Jessica');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.70);
    });

    it('should skip unknown proper nouns at sentence start', () => {
      const layer = createLayer();
      const result = layer.redact('Xylanthria is a nice place');
      // Unknown word at sentence start is too ambiguous — should be skipped
      expect(result.detections.find(d => d.value === 'Xylanthria')).toBeUndefined();
    });

    it('should apply larger penalty for lowercase names at sentence start', () => {
      const layer = createLayer();
      const result = layer.redact('jessica went to the store');
      const detection = result.detections.find(d => d.value === 'jessica');
      expect(detection).toBeDefined();
      // 0.65 - 0.20 = 0.45
      expect(detection!.confidence).toBe(0.45);
    });

    it('should not apply penalty for names mid-sentence', () => {
      const layer = createLayer();
      const result = layer.redact('I spoke to Jessica about it');
      const detection = result.detections.find(d => d.value === 'Jessica');
      expect(detection).toBeDefined();
      expect(detection!.confidence).toBe(0.85);
    });
  });

  describe('Token generation', () => {
    it('should produce tokens with PUA markers', () => {
      const layer = createLayer();
      const result = layer.redact('Ask Jennifer about it');
      expect(result.tokens.size).toBe(1);
      for (const [token] of result.tokens) {
        expect(token).toContain('\uE000');
        expect(token).toContain('\uE001');
      }
    });

    it('should map tokens to original values', () => {
      const layer = createLayer();
      const result = layer.redact('Tell Brandon to call Jennifer');
      expect(result.tokens.size).toBe(2);
      const values = [...result.tokens.values()];
      expect(values).toContain('Brandon');
      expect(values).toContain('Jennifer');
    });
  });

  describe('Text replacement', () => {
    it('should replace names in output text', () => {
      const layer = createLayer();
      const result = layer.redact('Hello Jessica, please call Brandon');
      expect(result.text).not.toContain('Jessica');
      expect(result.text).not.toContain('Brandon');
      expect(result.text).toContain('\uE000');
    });

    it('should preserve non-name text', () => {
      const layer = createLayer();
      const result = layer.redact('Tell Jessica to call me');
      expect(result.text).toContain('Tell');
      expect(result.text).toContain('to call me');
    });
  });
});
