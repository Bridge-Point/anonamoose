import { describe, it, expect } from 'vitest';
import { Tokenizer } from '../../src/core/redaction/tokenizer.js';

describe('Tokenizer', () => {
  it('should generate unique placeholders', () => {
    const tokenizer = new Tokenizer();
    const tokens = new Set<string>();

    for (let i = 0; i < 100; i++) {
      tokens.add(tokenizer.generatePlaceholder());
    }

    expect(tokens.size).toBe(100);
  });

  it('should wrap placeholders with Unicode PUA markers', () => {
    const tokenizer = new Tokenizer();
    const placeholder = tokenizer.generatePlaceholder();

    expect(placeholder.startsWith('\uE000')).toBe(true);
    expect(placeholder.endsWith('\uE001')).toBe(true);
  });

  it('should generate placeholders of consistent length', () => {
    const tokenizer = new Tokenizer();

    for (let i = 0; i < 20; i++) {
      const placeholder = tokenizer.generatePlaceholder();
      // \uE000 (1 char) + 16 hex chars + \uE001 (1 char) = 18
      expect(placeholder.length).toBe(18);
    }
  });

  it('should tokenize text by replacing values with placeholders', () => {
    const tokenizer = new Tokenizer();
    const tokenMap = new Map<string, string>();
    tokenMap.set('\uE000abc123\uE001', 'Sarah');
    tokenMap.set('\uE000def456\uE001', 'john@test.com');

    const result = tokenizer.tokenize(
      'Sarah sent an email to john@test.com',
      tokenMap
    );

    expect(result).not.toContain('Sarah');
    expect(result).not.toContain('john@test.com');
    expect(result).toContain('\uE000abc123\uE001');
    expect(result).toContain('\uE000def456\uE001');
  });

  it('should extract token ID from placeholder', () => {
    const tokenizer = new Tokenizer();
    const extracted = tokenizer.extractToken('\uE000mytoken123\uE001');
    expect(extracted).toBe('mytoken123');
  });

  it('should return null when no token is found', () => {
    const tokenizer = new Tokenizer();
    const extracted = tokenizer.extractToken('plain text with no tokens');
    expect(extracted).toBeNull();
  });

  it('should handle multiple replacements of the same value', () => {
    const tokenizer = new Tokenizer();
    const tokenMap = new Map<string, string>();
    tokenMap.set('\uE000token1\uE001', 'Melbourne');

    const result = tokenizer.tokenize(
      'I live in Melbourne and Melbourne is great',
      tokenMap
    );

    expect(result).not.toContain('Melbourne');
    expect(result.split('\uE000token1\uE001').length - 1).toBe(2);
  });
});
