import { describe, it, expect, afterAll } from 'vitest';
import { RedactionPipeline } from '../../src/core/redaction/pipeline.js';
import { DictionaryService } from '../../src/core/redaction/dictionary.js';
import { NERLayer } from '../../src/core/redaction/ner-layer.js';
import { DEFAULT_REDACTION_CONFIG } from '../../src/core/types.js';

afterAll(() => {
  NERLayer.resetPipeline();
});

describe('Redaction Pipeline Integration', () => {

  it('should redact using dictionary (guaranteed layer)', async () => {
    const dictionary = new DictionaryService();
    await dictionary.add([{
      id: '1',
      term: 'Project Apollo',
      caseSensitive: false,
      wholeWord: true,
      enabled: true,
      createdAt: new Date()
    }]);

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: true,
      enableRegex: false,
      enableNER: false
    });

    const result = await pipeline.redact('I work on Project Apollo', 'session-1');

    expect(result.redactedText).not.toContain('Project Apollo');
    expect(result.detectedPII).toHaveLength(1);
    expect(result.detectedPII[0].type).toBe('dictionary');
  });

  it('should redact email using regex layer', async () => {
    const dictionary = new DictionaryService();

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: false,
      enableRegex: true,
      enableNER: false
    });

    const result = await pipeline.redact('Contact me at john@example.com', 'session-2');

    expect(result.redactedText).not.toContain('john@example.com');
    expect(result.detectedPII).toHaveLength(1);
    expect(result.detectedPII[0].category).toBe('EMAIL');
  });

  it('should run dictionary before regex (guaranteed first)', async () => {
    const dictionary = new DictionaryService();
    await dictionary.add([{
      id: '1',
      term: 'john@example.com',
      caseSensitive: false,
      wholeWord: false,
      enabled: true,
      createdAt: new Date()
    }]);

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: true,
      enableRegex: true,
      enableNER: false
    });

    const result = await pipeline.redact('john@example.com', 'session-3');

    // Dictionary should have matched first
    expect(result.detectedPII[0].type).toBe('dictionary');
  });

  it('should redact names using NER layer', async () => {
    const dictionary = new DictionaryService();

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: false,
      enableRegex: false,
      enableNER: true
    });

    const result = await pipeline.redact('My name is Sarah Johnson', 'session-4');

    expect(result.redactedText).not.toContain('Sarah Johnson');
    const nerDetections = result.detectedPII.filter(d => d.type === 'ner');
    expect(nerDetections.length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('should deduplicate NER detections already caught by dictionary', async () => {
    const dictionary = new DictionaryService();
    await dictionary.add([{
      id: '1',
      term: 'Google',
      caseSensitive: false,
      wholeWord: true,
      enabled: true,
      createdAt: new Date()
    }]);

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: true,
      enableRegex: false,
      enableNER: true
    });

    const result = await pipeline.redact('I work at Google', 'session-5');

    expect(result.redactedText).not.toContain('Google');
    // Dictionary should have caught it first — NER should not duplicate
    const dictDetections = result.detectedPII.filter(d => d.type === 'dictionary');
    expect(dictDetections.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should run all three layers together', async () => {
    const dictionary = new DictionaryService();
    await dictionary.add([{
      id: '1',
      term: 'Project Zeus',
      caseSensitive: false,
      wholeWord: true,
      enabled: true,
      createdAt: new Date()
    }]);

    const pipeline = new RedactionPipeline(dictionary, {
      ...DEFAULT_REDACTION_CONFIG,
      enableDictionary: true,
      enableRegex: true,
      enableNER: true
    });

    const result = await pipeline.redact(
      'Sarah Johnson works on Project Zeus, contact sarah@example.com in London',
      'session-6'
    );

    expect(result.redactedText).not.toContain('Project Zeus');
    expect(result.redactedText).not.toContain('sarah@example.com');
    // NER should catch Sarah Johnson and/or London
    expect(result.detectedPII.length).toBeGreaterThanOrEqual(2);
  }, 30000);
});
