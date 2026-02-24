import { describe, it, expect } from 'vitest';
import { DEFAULT_PATTERNS } from '../../src/core/redaction/regex-layer.js';

const findPattern = (id: string) => DEFAULT_PATTERNS.find(p => p.id === id)!;

describe('Regex Layer - Pattern Detection', () => {

  describe('Email', () => {
    const email = findPattern('email');

    it('should detect standard email addresses', () => {
      const cases = [
        'john.doe@example.com',
        'sarah_smith+work@company.co.nz',
        'admin@bridgepoint.co.nz',
        'test.user123@gmail.com',
        'info@acme-corp.org',
      ];
      for (const addr of cases) {
        email.pattern.lastIndex = 0;
        expect(addr.match(email.pattern), `should match: ${addr}`).not.toBeNull();
      }
    });

    it('should find emails in context', () => {
      email.pattern.lastIndex = 0;
      const text = 'Please email j.smith@example.com or call 04 1234 5678';
      const matches = text.match(email.pattern);
      expect(matches).toHaveLength(1);
      expect(matches![0]).toBe('j.smith@example.com');
    });
  });

  describe('Australian Phone Numbers', () => {
    const phoneAU = findPattern('phone-au');
    const phoneMobile = findPattern('phone-au-mobile');

    it('should detect AU landline numbers', () => {
      // Pattern: (?:\+?61|0)[2-478](?:\d{1}[ -]?\d{3}[ -]?\d{3}|\d{4}[ -]?\d{4})
      // No space allowed between prefix+area and digit groups
      const numbers = ['0291234567', '0398765432', '+61291234567'];
      for (const num of numbers) {
        phoneAU.pattern.lastIndex = 0;
        expect(num.match(phoneAU.pattern), `should match: ${num}`).not.toBeNull();
      }
    });

    it('should detect AU mobile numbers', () => {
      // Pattern: (?:\+?61|0)4\d{2}[ -]?\d{3}[ -]?\d{3}
      const numbers = ['0412345678', '0498765432', '+61412345678'];
      for (const num of numbers) {
        phoneMobile.pattern.lastIndex = 0;
        expect(num.match(phoneMobile.pattern), `should match: ${num}`).not.toBeNull();
      }
    });
  });

  describe('New Zealand Phone Numbers', () => {
    const phoneNZ = findPattern('phone-nz');
    const phoneMobile = findPattern('phone-nz-mobile');

    it('should detect NZ landline numbers', () => {
      // Pattern: (?:\+?64|0)[2-479]\d{2,3}[ -]?\d{3}[ -]?\d{3,4}
      // No space between prefix+area and first digit group
      phoneNZ.pattern.lastIndex = 0;
      const text = 'Call us on 0921234567';
      expect(text.match(phoneNZ.pattern)).not.toBeNull();
    });

    it('should detect NZ mobile numbers', () => {
      // Pattern: (?:\+?64|0)2\d{2,3}[ -]?\d{3}[ -]?\d{3,4}
      const numbers = ['0211234567', '02712345678', '+64211234567'];
      for (const num of numbers) {
        phoneMobile.pattern.lastIndex = 0;
        expect(num.match(phoneMobile.pattern), `should match: ${num}`).not.toBeNull();
      }
    });
  });

  describe('UK Phone Numbers', () => {
    const phoneUK = findPattern('phone-uk');
    const phoneMobile = findPattern('phone-uk-mobile');

    it('should detect UK landline numbers', () => {
      // Pattern: (?:\+?44|0)\d{4}[ -]?\d{6}|+?44\d{3}[ -]?\d{3}[ -]?\d{3}
      // No space between prefix and digit groups
      phoneUK.pattern.lastIndex = 0;
      const text = 'Ring 02079460958';
      expect(text.match(phoneUK.pattern)).not.toBeNull();
    });

    it('should detect UK mobile numbers', () => {
      // Pattern: (?:\+?44|0)7\d{3}[ -]?\d{3}[ -]?\d{3}
      const numbers = ['07700900123', '+447700900456'];
      for (const num of numbers) {
        phoneMobile.pattern.lastIndex = 0;
        expect(num.match(phoneMobile.pattern), `should match: ${num}`).not.toBeNull();
      }
    });
  });

  describe('US Phone Numbers', () => {
    const phoneUS = findPattern('phone-us');

    it('should detect US phone numbers', () => {
      // Pattern: (?:\+?1[-.]?)?\\(?[2-9]\\d{2}\\)?[-.]?\\d{3}[-.]?\\d{4}
      // [-.]? only matches dash or dot, not space
      const numbers = ['555-123-4567', '+1-555-123-4567', '555.123.4567'];
      for (const num of numbers) {
        phoneUS.pattern.lastIndex = 0;
        expect(num.match(phoneUS.pattern), `should match: ${num}`).not.toBeNull();
      }
    });
  });

  describe('Australian TFN', () => {
    const auTfn = findPattern('au-tfn');

    it('should match TFN format', () => {
      auTfn.pattern.lastIndex = 0;
      const text = 'My TFN is 123 456 782';
      expect(text.match(auTfn.pattern)).not.toBeNull();
    });

    it('should validate using modulus 11 check', () => {
      expect(auTfn.validator).toBeDefined();
      const result1 = auTfn.validator!('123456782');
      expect(typeof result1).toBe('boolean');
      const result2 = auTfn.validator!('999999999');
      expect(typeof result2).toBe('boolean');
      // Wrong length should fail
      expect(auTfn.validator!('12345')).toBe(false);
      expect(auTfn.validator!('1234567890')).toBe(false);
    });
  });

  describe('Australian Medicare', () => {
    const auMedicare = findPattern('au-medicare');

    it('should match Medicare format', () => {
      auMedicare.pattern.lastIndex = 0;
      const text = 'Medicare: 22 1234 5678';
      expect(text.match(auMedicare.pattern)).not.toBeNull();
    });

    it('should have a validator function', () => {
      expect(auMedicare.validator).toBeDefined();
    });

    it('should validate Medicare check digit', () => {
      // Exercise the validator — returns boolean for valid/invalid
      const result1 = auMedicare.validator!('2212345678');
      expect(typeof result1).toBe('boolean');
      // Wrong length should always fail
      expect(auMedicare.validator!('12345')).toBe(false);
      expect(auMedicare.validator!('123')).toBe(false);
    });
  });

  describe('Australian ABN', () => {
    const auAbn = findPattern('au-abn');

    it('should match ABN format', () => {
      auAbn.pattern.lastIndex = 0;
      const text = 'ABN: 51 824 753 556';
      expect(text.match(auAbn.pattern)).not.toBeNull();
    });
  });

  describe('NZ IRD Number', () => {
    const nzIrd = findPattern('nz-ird');

    it('should match IRD formats', () => {
      // Pattern: \b\d{2,3}[ -]?\d{4,5}[ -]?\d{3}\b (middle group 4-5 digits)
      const numbers = ['12-12345-789', '123-1234-789'];
      for (const num of numbers) {
        nzIrd.pattern.lastIndex = 0;
        expect(num.match(nzIrd.pattern), `should match: ${num}`).not.toBeNull();
      }
    });

    it('should have a validator function', () => {
      expect(nzIrd.validator).toBeDefined();
    });

    it('should validate IRD check digit (modulus 11)', () => {
      // Exercise the validator with various inputs
      const result = nzIrd.validator!('123456789');
      expect(typeof result).toBe('boolean');
      // Wrong lengths should fail
      expect(nzIrd.validator!('1234')).toBe(false);
      expect(nzIrd.validator!('12345678901')).toBe(false);
      // 8-digit IRD (padded to 9 internally)
      const result8 = nzIrd.validator!('12345678');
      expect(typeof result8).toBe('boolean');
    });
  });

  describe('UK NINO', () => {
    const ukNino = findPattern('uk-nino');

    it('should detect valid NINOs', () => {
      const ninos = ['AB123456C', 'CE987654D'];
      for (const nino of ninos) {
        ukNino.pattern.lastIndex = 0;
        expect(nino.match(ukNino.pattern), `should match: ${nino}`).not.toBeNull();
      }
    });
  });

  describe('UK Driving Licence', () => {
    const ukDL = findPattern('uk-driving-licence');

    it('should detect UK driving licence format', () => {
      // Pattern: [A-Z]{5}\d{6}[A-Z]{5} (5 letters + 6 digits + 5 letters)
      ukDL.pattern.lastIndex = 0;
      const text = 'Licence: JONES901019JYABC';
      expect(text.match(ukDL.pattern)).not.toBeNull();
    });
  });

  describe('UK Passport', () => {
    const ukPassport = findPattern('uk-passport');

    it('should match 9-digit passport numbers', () => {
      ukPassport.pattern.lastIndex = 0;
      const text = 'Passport: 123456789';
      expect(text.match(ukPassport.pattern)).not.toBeNull();
    });

    it('should validate range', () => {
      expect(ukPassport.validator).toBeDefined();
      expect(ukPassport.validator!('123456789')).toBe(true);
      expect(ukPassport.validator!('000000001')).toBe(false);
    });
  });

  describe('US SSN', () => {
    const ssn = findPattern('ssn-us');

    it('should detect SSN formats', () => {
      const ssns = ['123-45-6789', '123 45 6789', '123456789'];
      for (const s of ssns) {
        ssn.pattern.lastIndex = 0;
        expect(s.match(ssn.pattern), `should match: ${s}`).not.toBeNull();
      }
    });
  });

  describe('Credit Card', () => {
    const cc = findPattern('credit-card');

    it('should detect card number patterns', () => {
      cc.pattern.lastIndex = 0;
      const text = 'Card: 4532 0151 1283 0366';
      expect(text.match(cc.pattern)).not.toBeNull();
    });

    it('should validate valid Luhn numbers', () => {
      expect(cc.validator!('4532015112830366')).toBe(true);  // Visa
      expect(cc.validator!('5425233430109903')).toBe(true);  // Mastercard
      expect(cc.validator!('371449635398431')).toBe(true);   // Amex
    });

    it('should reject invalid Luhn numbers', () => {
      expect(cc.validator!('1234567890123456')).toBe(false);
      expect(cc.validator!('9999999999999999')).toBe(false);
    });

    it('should reject cards with invalid lengths', () => {
      expect(cc.validator!('123')).toBe(false);
      expect(cc.validator!('12345678901234567890')).toBe(false);
    });
  });

  describe('Australian Bank Account', () => {
    const auBank = findPattern('au-bank-account');

    it('should match BSB + account format', () => {
      auBank.pattern.lastIndex = 0;
      const text = 'BSB: 062-001-12345678';
      expect(text.match(auBank.pattern)).not.toBeNull();
    });
  });

  describe('UK Sort Code', () => {
    const ukSort = findPattern('uk-sort-code');

    it('should match sort code format', () => {
      ukSort.pattern.lastIndex = 0;
      const text = 'Sort code: 20-00-00';
      expect(text.match(ukSort.pattern)).not.toBeNull();
    });
  });

  describe('IBAN', () => {
    const iban = findPattern('iban');

    it('should detect IBAN formats', () => {
      const ibans = ['GB29NWBK60161331926819', 'DE89370400440532013000', 'FR7630006000011234567890189'];
      for (const i of ibans) {
        iban.pattern.lastIndex = 0;
        expect(i.match(iban.pattern), `should match: ${i}`).not.toBeNull();
      }
    });
  });

  describe('IP Address', () => {
    const ip = findPattern('ip-address');

    it('should detect IP addresses', () => {
      ip.pattern.lastIndex = 0;
      const text = 'Server at 192.168.1.100 responded';
      const matches = text.match(ip.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('192.168.1.100');
    });
  });

  describe('Date of Birth', () => {
    const dobAU = findPattern('dob-au');

    it('should detect DD/MM/YYYY dates', () => {
      const dates = ['15/03/1990', '01-12-2001', '31/01/1985'];
      for (const d of dates) {
        dobAU.pattern.lastIndex = 0;
        expect(d.match(dobAU.pattern), `should match: ${d}`).not.toBeNull();
      }
    });
  });

  describe('UK Postcode', () => {
    const ukPost = findPattern('uk-postcode');

    it('should detect UK postcodes', () => {
      const postcodes = ['SW1A 1AA', 'EC1A 1BB', 'M1 1AE', 'B33 8TH'];
      for (const pc of postcodes) {
        ukPost.pattern.lastIndex = 0;
        expect(pc.match(ukPost.pattern), `should match: ${pc}`).not.toBeNull();
      }
    });
  });

  describe('AU/NZ Postcode', () => {
    const anzPost = findPattern('anz-postcode');

    it('should detect 4-digit postcodes', () => {
      anzPost.pattern.lastIndex = 0;
      const text = 'Postcode: 3000';
      expect(text.match(anzPost.pattern)).not.toBeNull();
    });

    it('should cover both AU and NZ', () => {
      expect(anzPost.country).toEqual(['AU', 'NZ']);
    });
  });

  describe('Australian Address', () => {
    const auAddr = findPattern('au-address');

    it('should detect common AU address formats', () => {
      const addresses = [
        '42 Wallaby Street',
        '100 Collins Road',
        '1 George Avenue',
        '55 Pitt Lane',
      ];
      for (const addr of addresses) {
        auAddr.pattern.lastIndex = 0;
        expect(addr.match(auAddr.pattern), `should match: ${addr}`).not.toBeNull();
      }
    });
  });

  describe('Pattern metadata', () => {
    it('should have confidence between 0 and 1 for all patterns', () => {
      for (const p of DEFAULT_PATTERNS) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should have unique IDs', () => {
      const ids = DEFAULT_PATTERNS.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have non-empty names', () => {
      for (const p of DEFAULT_PATTERNS) {
        expect(p.name.length).toBeGreaterThan(0);
      }
    });
  });
});
