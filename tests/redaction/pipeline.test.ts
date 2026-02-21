import { describe, it, expect } from 'vitest';
import { RedactionPipeline } from '../../src/core/redaction/pipeline.js';
import { DictionaryService } from '../../src/core/redaction/dictionary.js';
import { DEFAULT_REDACTION_CONFIG } from '../../src/core/types.js';

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
});
