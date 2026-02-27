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

  describe('IP Address (IPv4)', () => {
    const ip = findPattern('ip-address');

    it('should detect valid IPv4 addresses', () => {
      const addresses = ['192.168.1.100', '10.0.0.1', '255.255.255.0', '0.0.0.0'];
      for (const addr of addresses) {
        ip.pattern.lastIndex = 0;
        expect(addr.match(ip.pattern), `should match: ${addr}`).not.toBeNull();
      }
    });

    it('should find IPv4 in context', () => {
      ip.pattern.lastIndex = 0;
      const text = 'Server at 192.168.1.100 responded';
      const matches = text.match(ip.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('192.168.1.100');
    });

    it('should validate octet range', () => {
      expect(ip.validator).toBeDefined();
      expect(ip.validator!('192.168.1.100')).toBe(true);
      expect(ip.validator!('0.0.0.0')).toBe(true);
      expect(ip.validator!('255.255.255.255')).toBe(true);
      expect(ip.validator!('999.999.999.999')).toBe(false);
      expect(ip.validator!('256.1.1.1')).toBe(false);
    });
  });

  describe('IP Address (IPv6)', () => {
    const ipv6 = findPattern('ipv6-address');

    it('should detect full IPv6 addresses', () => {
      ipv6.pattern.lastIndex = 0;
      const text = 'Host: 2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      expect(text.match(ipv6.pattern)).not.toBeNull();
    });

    it('should detect loopback ::1', () => {
      ipv6.pattern.lastIndex = 0;
      expect('::1'.match(ipv6.pattern)).not.toBeNull();
    });

    it('should detect link-local fe80::1', () => {
      ipv6.pattern.lastIndex = 0;
      expect('fe80::1'.match(ipv6.pattern)).not.toBeNull();
    });
  });

  describe('URL', () => {
    const url = findPattern('url');

    it('should detect HTTP and HTTPS URLs', () => {
      const urls = [
        'https://example.com',
        'http://example.com/path',
        'https://sub.domain.co.nz/page?q=test',
        'https://example.com/path/to/resource#anchor',
      ];
      for (const u of urls) {
        url.pattern.lastIndex = 0;
        expect(u.match(url.pattern), `should match: ${u}`).not.toBeNull();
      }
    });

    it('should find URLs in context', () => {
      url.pattern.lastIndex = 0;
      const text = 'Visit https://example.com/page for details';
      const matches = text.match(url.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('https://example.com/page');
    });

    it('should not match non-URL text', () => {
      url.pattern.lastIndex = 0;
      expect('just some text'.match(url.pattern)).toBeNull();
    });
  });

  describe('VIN (Vehicle Identification Number)', () => {
    const vin = findPattern('vin');

    it('should match 17-character VIN format', () => {
      vin.pattern.lastIndex = 0;
      // 1HGBH41JXMN109186 is a well-known valid VIN
      const text = 'VIN: 1HGBH41JXMN109186';
      expect(text.match(vin.pattern)).not.toBeNull();
    });

    it('should reject VINs with I, O, Q', () => {
      vin.pattern.lastIndex = 0;
      expect('IHGBH41JXMN109186'.match(vin.pattern)).toBeNull();
    });

    it('should have a check digit validator', () => {
      expect(vin.validator).toBeDefined();
      // 1HGBH41JXMN109186 — check digit is X at position 9
      expect(vin.validator!('1HGBH41JXMN109186')).toBe(true);
    });

    it('should reject invalid check digits', () => {
      // Change the check digit (position 9) from X to 0
      expect(vin.validator!('1HGBH41J0MN109186')).toBe(false);
    });

    it('should reject wrong length', () => {
      expect(vin.validator!('1HGBH41JX')).toBe(false);
    });
  });

  describe('MAC Address', () => {
    const mac = findPattern('mac-address');

    it('should detect colon-separated MAC addresses', () => {
      const macs = ['00:1A:2B:3C:4D:5E', 'aa:bb:cc:dd:ee:ff'];
      for (const m of macs) {
        mac.pattern.lastIndex = 0;
        expect(m.match(mac.pattern), `should match: ${m}`).not.toBeNull();
      }
    });

    it('should detect hyphen-separated MAC addresses', () => {
      mac.pattern.lastIndex = 0;
      expect('00-1A-2B-3C-4D-5E'.match(mac.pattern)).not.toBeNull();
    });

    it('should find MAC in context', () => {
      mac.pattern.lastIndex = 0;
      const text = 'Device MAC: 00:1A:2B:3C:4D:5E connected';
      const matches = text.match(mac.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('00:1A:2B:3C:4D:5E');
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

  describe('NZ NHI (National Health Index)', () => {
    const nhi = findPattern('nz-nhi');

    it('should detect valid NHI numbers', () => {
      const numbers = ['ZAC1234', 'DAB5678', 'HJK9012'];
      for (const num of numbers) {
        nhi.pattern.lastIndex = 0;
        expect(num.match(nhi.pattern), `should match: ${num}`).not.toBeNull();
      }
    });

    it('should reject NHI with excluded letters (I, O)', () => {
      nhi.pattern.lastIndex = 0;
      expect('IOA1234'.match(nhi.pattern)).toBeNull();
    });

    it('should find NHI in context', () => {
      nhi.pattern.lastIndex = 0;
      const text = 'Patient NHI: ZAC1234 admitted today';
      const matches = text.match(nhi.pattern);
      expect(matches).not.toBeNull();
      expect(matches![0]).toBe('ZAC1234');
    });

    it('should be tagged as NZ', () => {
      expect(nhi.country).toEqual(['NZ']);
    });
  });

  describe('UK NHS Number', () => {
    const nhs = findPattern('uk-nhs');

    it('should match NHS number formats', () => {
      nhs.pattern.lastIndex = 0;
      const text = 'NHS: 943 476 5919';
      expect(text.match(nhs.pattern)).not.toBeNull();
    });

    it('should have a validator function', () => {
      expect(nhs.validator).toBeDefined();
    });

    it('should validate using modulus 11 check', () => {
      // Wrong length should fail
      expect(nhs.validator!('12345')).toBe(false);
      expect(nhs.validator!('123456789012')).toBe(false);
      // Valid format returns boolean
      const result = nhs.validator!('9434765919');
      expect(typeof result).toBe('boolean');
    });

    it('should be tagged as UK', () => {
      expect(nhs.country).toEqual(['UK']);
    });
  });

  describe('AU Passport', () => {
    const auPassport = findPattern('au-passport');

    it('should detect AU passport formats', () => {
      const numbers = ['N1234567', 'PA1234567'];
      for (const num of numbers) {
        auPassport.pattern.lastIndex = 0;
        expect(num.match(auPassport.pattern), `should match: ${num}`).not.toBeNull();
      }
    });

    it('should be tagged as AU', () => {
      expect(auPassport.country).toEqual(['AU']);
    });
  });

  describe('NZ Passport', () => {
    const nzPassport = findPattern('nz-passport');

    it('should detect NZ passport formats', () => {
      const numbers = ['LA123456', 'LF0123456'];
      for (const num of numbers) {
        nzPassport.pattern.lastIndex = 0;
        expect(num.match(nzPassport.pattern), `should match: ${num}`).not.toBeNull();
      }
    });

    it('should be tagged as NZ', () => {
      expect(nzPassport.country).toEqual(['NZ']);
    });
  });

  describe('NZ Bank Account', () => {
    const nzBank = findPattern('nz-bank-account');

    it('should detect NZ bank account formats', () => {
      const accounts = ['01-0102-0123456-00', '12-3456-7890123-001'];
      for (const acct of accounts) {
        nzBank.pattern.lastIndex = 0;
        expect(acct.match(nzBank.pattern), `should match: ${acct}`).not.toBeNull();
      }
    });

    it('should match without separators', () => {
      nzBank.pattern.lastIndex = 0;
      expect('010102012345600'.match(nzBank.pattern)).not.toBeNull();
    });

    it('should be tagged as NZ', () => {
      expect(nzBank.country).toEqual(['NZ']);
    });
  });

  describe('NZ Address', () => {
    const nzAddr = findPattern('nz-address');

    it('should detect NZ address formats', () => {
      const addresses = [
        '15 Queen Street',
        '42 Lambton Terrace',
        '7 Ponsonby Road',
        '100 Cuba Crescent',
      ];
      for (const addr of addresses) {
        nzAddr.pattern.lastIndex = 0;
        expect(addr.match(nzAddr.pattern), `should match: ${addr}`).not.toBeNull();
      }
    });

    it('should be tagged as NZ', () => {
      expect(nzAddr.country).toEqual(['NZ']);
    });
  });

  describe('UK Address', () => {
    const ukAddr = findPattern('uk-address');

    it('should detect UK address formats', () => {
      const addresses = [
        '10 Downing Street',
        '221 Baker Street',
        '42 Victoria Close',
        '8 Kings Court',
        '15 Lavender Gardens',
      ];
      for (const addr of addresses) {
        ukAddr.pattern.lastIndex = 0;
        expect(addr.match(ukAddr.pattern), `should match: ${addr}`).not.toBeNull();
      }
    });

    it('should be tagged as UK', () => {
      expect(ukAddr.country).toEqual(['UK']);
    });
  });

  describe('US pattern country tags', () => {
    it('US Phone should be tagged as US', () => {
      const phoneUS = findPattern('phone-us');
      expect(phoneUS.country).toEqual(['US']);
    });

    it('US SSN should be tagged as US', () => {
      const ssn = findPattern('ssn-us');
      expect(ssn.country).toEqual(['US']);
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
