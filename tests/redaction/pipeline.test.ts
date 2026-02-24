import { describe, it, expect, afterAll } from 'vitest';
import { RedactionPipeline } from '../../src/core/redaction/pipeline.js';
import { DictionaryService } from '../../src/core/redaction/dictionary.js';
import { NERLayer } from '../../src/core/redaction/ner-layer.js';
import { DEFAULT_REDACTION_CONFIG } from '../../src/core/types.js';

afterAll(() => {
  NERLayer.resetPipeline();
});

// Helper to create a pipeline with optional dictionary entries
const createPipeline = async (
  config: Partial<typeof DEFAULT_REDACTION_CONFIG> = {},
  dictTerms: string[] = []
) => {
  const dictionary = new DictionaryService();
  if (dictTerms.length) {
    await dictionary.add(dictTerms.map((term, i) => ({
      id: `d-${i}`,
      term,
      caseSensitive: false,
      wholeWord: true,
      enabled: true,
      createdAt: new Date(),
    })));
  }
  return new RedactionPipeline(dictionary, { ...DEFAULT_REDACTION_CONFIG, ...config });
};

describe('Redaction Pipeline', () => {

  describe('Dictionary Layer (Guaranteed)', () => {
    it('should redact a company name via dictionary', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: false, enableNER: false },
        ['Acme Corp']
      );
      const result = await pipeline.redact('I work at Acme Corp', 'sess-1');
      expect(result.redactedText).not.toContain('Acme Corp');
      expect(result.detectedPII).toHaveLength(1);
      expect(result.detectedPII[0].type).toBe('dictionary');
    });

    it('should redact multiple dictionary terms', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: false, enableNER: false },
        ['Project Apollo', 'Jane Smith', 'Wellington Office']
      );
      const result = await pipeline.redact(
        'Jane Smith manages Project Apollo from the Wellington Office',
        'sess-2'
      );
      expect(result.redactedText).not.toContain('Project Apollo');
      expect(result.redactedText).not.toContain('Jane Smith');
      expect(result.redactedText).not.toContain('Wellington Office');
      expect(result.detectedPII).toHaveLength(3);
    });
  });

  describe('Regex Layer (Deterministic)', () => {
    it('should redact email addresses', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: true, enableNER: false,
      });
      const result = await pipeline.redact('Email me at sarah.j@company.co.nz', 'sess-3');
      expect(result.redactedText).not.toContain('sarah.j@company.co.nz');
      expect(result.detectedPII.some(d => d.category === 'EMAIL')).toBe(true);
    });

    it('should redact AU phone numbers', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: true, enableNER: false,
      });
      const result = await pipeline.redact('Call me on 0412 345 678', 'sess-4');
      expect(result.redactedText).not.toContain('0412 345 678');
    });

    it('should redact UK NINO', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: true, enableNER: false,
      });
      const result = await pipeline.redact('NINO: AB123456C', 'sess-5');
      expect(result.redactedText).not.toContain('AB123456C');
    });

    it('should redact IP addresses', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: true, enableNER: false,
      });
      const result = await pipeline.redact('Server IP is 10.0.0.42', 'sess-6');
      expect(result.redactedText).not.toContain('10.0.0.42');
    });

    it('should redact credit card with Luhn validation', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: true, enableNER: false,
      });
      // Valid Visa test number
      const result = await pipeline.redact('Card: 4532 0151 1283 0366', 'sess-7');
      expect(result.redactedText).not.toContain('4532 0151 1283 0366');
    });
  });

  describe('NER Layer (Probabilistic)', () => {
    it('should redact person names', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: false, enableNER: true,
      });
      const result = await pipeline.redact('My name is Sarah Johnson', 'sess-8');
      expect(result.redactedText).not.toContain('Sarah Johnson');
      const nerDetections = result.detectedPII.filter(d => d.type === 'ner');
      expect(nerDetections.length).toBeGreaterThanOrEqual(1);
    }, 60000);

    it('should redact organizations', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: false, enableNER: true,
      });
      const result = await pipeline.redact('She works at Microsoft', 'sess-9');
      expect(result.redactedText).not.toContain('Microsoft');
    }, 30000);

    it('should redact locations', async () => {
      const pipeline = await createPipeline({
        enableDictionary: false, enableRegex: false, enableNER: true,
      });
      const result = await pipeline.redact('He lives in London', 'sess-10');
      expect(result.redactedText).not.toContain('London');
    }, 30000);
  });

  describe('Multi-Layer Integration', () => {
    it('dictionary runs before regex — dictionary gets priority', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: true, enableNER: false },
        ['john@example.com']
      );
      const result = await pipeline.redact('john@example.com', 'sess-11');
      expect(result.detectedPII[0].type).toBe('dictionary');
    });

    it('should deduplicate NER detections caught by dictionary', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: false, enableNER: true },
        ['Google']
      );
      const result = await pipeline.redact('I work at Google', 'sess-12');
      expect(result.redactedText).not.toContain('Google');
      const dictDetections = result.detectedPII.filter(d => d.type === 'dictionary');
      expect(dictDetections.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('should run all three layers on rich PII text', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: true, enableNER: true },
        ['Project Zeus']
      );
      const result = await pipeline.redact(
        'Sarah Johnson works on Project Zeus, email sarah@example.com, based in London',
        'sess-13'
      );
      expect(result.redactedText).not.toContain('Project Zeus');
      expect(result.redactedText).not.toContain('sarah@example.com');
      expect(result.detectedPII.length).toBeGreaterThanOrEqual(2);
    }, 30000);

    it('should handle text with no PII', async () => {
      const pipeline = await createPipeline({
        enableDictionary: true, enableRegex: true, enableNER: true,
      });
      const text = 'The quick brown fox jumps over the lazy dog';
      const result = await pipeline.redact(text, 'sess-14');
      expect(result.redactedText).toBe(text);
      expect(result.detectedPII).toHaveLength(0);
    }, 30000);
  });

  describe('Token Maps', () => {
    it('should generate unique tokens per detected PII', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: false, enableRegex: true, enableNER: false }
      );
      const result = await pipeline.redact(
        'Email alice@test.com or bob@test.com',
        'sess-15'
      );
      expect(result.tokens.size).toBeGreaterThanOrEqual(2);
    });

    it('tokens should contain Unicode PUA markers', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: false, enableRegex: true, enableNER: false }
      );
      const result = await pipeline.redact('Contact: test@example.com', 'sess-16');
      for (const [token] of result.tokens) {
        expect(token).toContain('\uE000');
        expect(token).toContain('\uE001');
      }
    });

    it('should include session ID as rehydration key', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: false, enableRegex: true, enableNER: false }
      );
      const result = await pipeline.redact('test@example.com', 'my-session');
      expect(result.rehydrationKey).toBe('my-session');
    });

    it('should expose dictionary via getDictionary()', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: false, enableNER: false },
        ['Test Term']
      );
      const dict = pipeline.getDictionary();
      expect(dict).toBeDefined();
      expect(dict.size()).toBe(1);
      expect(dict.list()[0].term).toBe('Test Term');
    });
  });

  describe('Synthetic PII Scenarios', () => {
    it('should redact a fake patient record', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: true, enableNER: false },
        ['Dr. Emily Chen']
      );
      const record = `
        Patient referred by Dr. Emily Chen.
        Contact: emily.chen@hospital.com.au
        Phone: 03 9876 5432
        DOB: 15/03/1985
      `;
      const result = await pipeline.redact(record, 'sess-17');
      expect(result.redactedText).not.toContain('Dr. Emily Chen');
      expect(result.redactedText).not.toContain('emily.chen@hospital.com.au');
      expect(result.detectedPII.length).toBeGreaterThanOrEqual(2);
    });

    it('should redact a fake support ticket', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: true, enableNER: false },
        ['Bridge Point Ltd']
      );
      const ticket = `
        Customer: Bridge Point Ltd
        Email: support@bridgepoint.co.nz
        Issue: Server at 192.168.1.50 is unresponsive
      `;
      const result = await pipeline.redact(ticket, 'sess-18');
      expect(result.redactedText).not.toContain('Bridge Point Ltd');
      expect(result.redactedText).not.toContain('support@bridgepoint.co.nz');
      expect(result.redactedText).not.toContain('192.168.1.50');
    });

    it('should redact a fake UK employment form', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: false, enableRegex: true, enableNER: false }
      );
      const form = 'NINO: AB123456C, Postcode: SW1A 1AA';
      const result = await pipeline.redact(form, 'sess-19');
      expect(result.redactedText).not.toContain('AB123456C');
      expect(result.redactedText).not.toContain('SW1A 1AA');
    });

    it('should redact a fake NZ customer record', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: true, enableRegex: true, enableNER: false },
        ['Kiwi Insurance Ltd']
      );
      const record = `
        Company: Kiwi Insurance Ltd
        Contact: claims@kiwiinsurance.co.nz
        Phone: 021 555 7890
      `;
      const result = await pipeline.redact(record, 'sess-20');
      expect(result.redactedText).not.toContain('Kiwi Insurance Ltd');
      expect(result.redactedText).not.toContain('claims@kiwiinsurance.co.nz');
    });

    it('should redact a fake financial message', async () => {
      const pipeline = await createPipeline(
        { enableDictionary: false, enableRegex: true, enableNER: false }
      );
      const msg = 'Please transfer to IBAN: GB29NWBK60161331926819';
      const result = await pipeline.redact(msg, 'sess-21');
      expect(result.redactedText).not.toContain('GB29NWBK60161331926819');
    });
  });
});
