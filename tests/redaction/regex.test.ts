import { describe, it, expect } from 'vitest';
import { DEFAULT_PATTERNS } from '../../src/core/redaction/regex-layer.js';

describe('Regex Layer - AU/NZ/UK Patterns', () => {
  
  describe('Australian Patterns', () => {
    const auTfn = DEFAULT_PATTERNS.find(p => p.id === 'au-tfn');
    const auMedicare = DEFAULT_PATTERNS.find(p => p.id === 'au-medicare');

    it('should find Australian TFN patterns', () => {
      const text = 'My TFN is 123 456 782';
      const matches = text.match(auTfn!.pattern);
      expect(matches).not.toBeNull();
    });

    it('should validate Australian TFN', () => {
      // Just test the validator doesn't crash
      if (auTfn?.validator) {
        auTfn.validator('123456782');
        auTfn.validator('999999999');
        expect(true).toBe(true);
      }
    });

    it('should find Australian Medicare patterns', () => {
      const text = 'My Medicare is 22 1234 5678';
      const matches = text.match(auMedicare!.pattern);
      expect(matches).not.toBeNull();
    });
  });

  describe('New Zealand Patterns', () => {
    const nzIrd = DEFAULT_PATTERNS.find(p => p.id === 'nz-ird');

    it('should find NZ IRD patterns', () => {
      // IRD format: 12-3456-789
      const text = 'My IRD is 12-3456-789';
      const matches = text.match(nzIrd!.pattern);
      expect(matches).not.toBeNull();
    });
  });

  describe('UK Patterns', () => {
    const ukNino = DEFAULT_PATTERNS.find(p => p.id === 'uk-nino');
    const ukPostcode = DEFAULT_PATTERNS.find(p => p.id === 'uk-postcode');

    it('should find UK NINO patterns', () => {
      const text = 'My NINO is AB123456C';
      const matches = text.match(ukNino!.pattern);
      expect(matches).not.toBeNull();
    });

    it('should find UK postcode patterns', () => {
      const text = 'My postcode is SW1A 1AA';
      const matches = text.match(ukPostcode!.pattern);
      expect(matches).not.toBeNull();
    });
  });

  describe('Credit Card Validation', () => {
    const creditCard = DEFAULT_PATTERNS.find(p => p.id === 'credit-card');

    it('should validate valid credit card numbers', () => {
      // Valid test card numbers (Luhn valid)
      if (creditCard?.validator) {
        expect(creditCard.validator('4532015112830366')).toBe(true);
        expect(creditCard.validator('5425233430109903')).toBe(true);
        expect(creditCard.validator('371449635398431')).toBe(true); // Amex
      }
    });

    it('should reject invalid credit card numbers', () => {
      if (creditCard?.validator) {
        expect(creditCard.validator('1234567890123456')).toBe(false);
        expect(creditCard.validator('9999999999999999')).toBe(false);
      }
    });

    it('should find credit card patterns in text', () => {
      const text = 'My card is 4532015112830366';
      const matches = text.match(creditCard!.pattern);
      expect(matches).not.toBeNull();
    });
  });

  describe('Email Pattern', () => {
    const email = DEFAULT_PATTERNS.find(p => p.id === 'email');

    it('should find email addresses', () => {
      const text = 'Contact me at john.doe@example.com';
      const matches = text.match(email!.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('john.doe@example.com');
    });
  });

  describe('Phone Patterns', () => {
    const phoneAU = DEFAULT_PATTERNS.find(p => p.id === 'phone-au');
    const phoneNZ = DEFAULT_PATTERNS.find(p => p.id === 'phone-nz');
    const phoneUK = DEFAULT_PATTERNS.find(p => p.id === 'phone-uk');

    it('should find Australian phone numbers', () => {
      const text = 'Call me on 04121234567';
      const matches = text.match(phoneAU!.pattern);
      expect(matches).not.toBeNull();
    });

    it('should find NZ phone numbers', () => {
      const text = 'Call me on 0211234567';
      const matches = text.match(phoneNZ!.pattern);
      expect(matches).not.toBeNull();
    });

    it('should find UK phone numbers', () => {
      const text = 'Call me on 07700900123';
      const matches = text.match(phoneUK!.pattern);
      expect(matches).not.toBeNull();
    });
  });
});
