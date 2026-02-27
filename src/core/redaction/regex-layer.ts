import type { PIIDetection } from '../types.js';

export interface RegexPattern {
  id: string;
  name: string;
  pattern: RegExp;
  validator?: (match: string) => boolean;
  confidence: number;
  country?: string[];
}

const luhnCheck = (card: string): boolean => {
  const digits = card.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

const auMedicareCheck = (num: string): boolean => {
  const digits = num.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  
  // Medicare check digit algorithm
  const positionWeights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i], 10) * positionWeights[i];
  }
  
  return sum % 10 === 0;
};

const auTfnCheck = (num: string): boolean => {
  const digits = num.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  
  // TFN uses modulus 11 algorithm
  const weights = [1, 2, 3, 4, 5, 6, 7, 8, 10];
  let sum = 0;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }
  
  const remainder = sum % 11;
  return remainder === 0;
};

const nzIrdCheck = (num: string): boolean => {
  const digits = num.replace(/\D/g, '');
  if (digits.length !== 8 && digits.length !== 9) return false;

  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  const paddedDigits = digits.padStart(9, '0');
  for (let i = 0; i < 8; i++) {
    sum += parseInt(paddedDigits[i], 10) * weights[i];
  }

  const remainder = sum % 11;
  const expectedCheck = remainder === 0 ? 0 : 11 - remainder;

  return parseInt(paddedDigits[8], 10) === expectedCheck;
};

const vinCheck = (vin: string): boolean => {
  if (vin.length !== 17) return false;
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i].toUpperCase();
    const val = /\d/.test(c) ? parseInt(c, 10) : transliteration[c];
    if (val === undefined) return false;
    sum += val * weights[i];
  }
  const remainder = sum % 11;
  const checkChar = remainder === 10 ? 'X' : String(remainder);
  return vin[8].toUpperCase() === checkChar;
};

const ipV4Check = (ip: string): boolean => {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255;
  });
};

const ukNhsCheck = (num: string): boolean => {
  const digits = num.replace(/\D/g, '');
  if (digits.length !== 10) return false;

  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = 11 - remainder;
  if (checkDigit === 11) return parseInt(digits[9], 10) === 0;
  if (checkDigit === 10) return false;
  return parseInt(digits[9], 10) === checkDigit;
};

export const DEFAULT_PATTERNS: RegexPattern[] = [
  // Email (universal)
  {
    id: 'email',
    name: 'EMAIL',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    confidence: 0.95
  },
  
  // Phone - Australia
  {
    id: 'phone-au',
    name: 'PHONE_AU',
    pattern: /(?:\+?61|0)[2-478](?:\d{1}[ -]?\d{3}[ -]?\d{3}|\d{4}[ -]?\d{4})/g,
    confidence: 0.90,
    country: ['AU']
  },
  // Phone - Australia mobile
  {
    id: 'phone-au-mobile',
    name: 'PHONE_AU_MOBILE',
    pattern: /(?:\+?61|0)4\d{2}[ -]?\d{3}[ -]?\d{3}/g,
    confidence: 0.92,
    country: ['AU']
  },
  
  // Phone - New Zealand
  {
    id: 'phone-nz',
    name: 'PHONE_NZ',
    pattern: /(?:\+?64|0)[2-479]\d{2,3}[ -]?\d{3}[ -]?\d{3,4}/g,
    confidence: 0.90,
    country: ['NZ']
  },
  // Phone - New Zealand mobile
  {
    id: 'phone-nz-mobile',
    name: 'PHONE_NZ_MOBILE',
    pattern: /(?:\+?64|0)2\d{2,3}[ -]?\d{3}[ -]?\d{3,4}/g,
    confidence: 0.92,
    country: ['NZ']
  },
  
  // Phone - UK
  {
    id: 'phone-uk',
    name: 'PHONE_UK',
    pattern: /(?:\+?44|0)\d{4}[ -]?\d{6}|\+?44\d{3}[ -]?\d{3}[ -]?\d{3}/g,
    confidence: 0.88,
    country: ['UK']
  },
  // Phone - UK mobile
  {
    id: 'phone-uk-mobile',
    name: 'PHONE_UK_MOBILE',
    pattern: /(?:\+?44|0)7\d{3}[ -]?\d{3}[ -]?\d{3}/g,
    confidence: 0.92,
    country: ['UK']
  },
  // Phone - US
  {
    id: 'phone-us',
    name: 'PHONE_US',
    pattern: /(?:\+?1[-.]?)?\(?[2-9]\d{2}\)?[-.]?\d{3}[-.]?\d{4}/g,
    confidence: 0.90,
    country: ['US']
  },
  
  // TFN - Australia (Tax File Number)
  {
    id: 'au-tfn',
    name: 'AU_TFN',
    pattern: /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
    validator: auTfnCheck,
    confidence: 0.95,
    country: ['AU']
  },
  
  // Medicare - Australia
  {
    id: 'au-medicare',
    name: 'AU_MEDICARE',
    pattern: /\b\d{2}[ -]?\d{4}[ -]?\d{4}\b/g,
    validator: auMedicareCheck,
    confidence: 0.95,
    country: ['AU']
  },
  
  // ABN - Australia (Australian Business Number)
  {
    id: 'au-abn',
    name: 'AU_ABN',
    pattern: /\b\d{2}[ -]?\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
    confidence: 0.90,
    country: ['AU']
  },
  
  // IRD - New Zealand (Inland Revenue Department)
  {
    id: 'nz-ird',
    name: 'NZ_IRD',
    pattern: /\b\d{2,3}[ -]?\d{4,5}[ -]?\d{3}\b/g,
    validator: nzIrdCheck,
    confidence: 0.95,
    country: ['NZ']
  },
  
  // NINO - UK (National Insurance Number)
  {
    id: 'uk-nino',
    name: 'UK_NINO',
    pattern: /\b[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}[0-9]{6}[A-D]{1}\b/gi,
    confidence: 0.98,
    country: ['UK']
  },
  
  // UK Passport Number (9 digits, validated range)
  {
    id: 'uk-passport',
    name: 'UK_PASSPORT',
    pattern: /\b\d{9}\b/g,
    validator: (match: string) => {
      const num = parseInt(match, 10);
      return num >= 100000000 && num <= 999999999;
    },
    confidence: 0.75,
    country: ['UK']
  },
  
  // UK Driving Licence
  {
    id: 'uk-driving-licence',
    name: 'UK_DRIVING_LICENCE',
    pattern: /\b[A-Z]{5}\d{6}[A-Z]{5}\b|\b\d{5}[ -]?\d{5}[ -]?\d{5}[ -]?\d{2}\b/gi,
    confidence: 0.85,
    country: ['UK']
  },
  
  // SSN - US
  {
    id: 'ssn-us',
    name: 'SSN_US',
    pattern: /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/g,
    confidence: 0.90,
    country: ['US']
  },
  
  // Credit Card (all major cards)
  {
    id: 'credit-card',
    name: 'CREDIT_CARD',
    pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    validator: luhnCheck,
    confidence: 0.95
  },
  
  // Bank Account - Australia (BSB + Account)
  {
    id: 'au-bank-account',
    name: 'AU_BANK_ACCOUNT',
    pattern: /\b\d{3}[ -]?\d{3}[ -]\d{1,10}\b/g,
    confidence: 0.85,
    country: ['AU']
  },
  
  // UK Sort Code
  {
    id: 'uk-sort-code',
    name: 'UK_SORT_CODE',
    pattern: /\b\d{2}[ -]?\d{2}[ -]?\d{2}\b/g,
    confidence: 0.80,
    country: ['UK']
  },
  
  // IBAN (International Bank Account Number) - UK, EU, AU, NZ
  {
    id: 'iban',
    name: 'IBAN',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,31}\b/g,
    confidence: 0.95
  },
  
  // IP Address (IPv4)
  {
    id: 'ip-address',
    name: 'IP_ADDRESS',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validator: ipV4Check,
    confidence: 0.90
  },

  // IP Address (IPv6) — full, abbreviated (::), and mixed forms
  {
    id: 'ipv6-address',
    name: 'IPV6_ADDRESS',
    pattern: /(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}|::)/g,
    confidence: 0.90
  },

  // URL (http/https)
  {
    id: 'url',
    name: 'URL',
    pattern: /https?:\/\/[^\s<>"')\]},]+/gi,
    confidence: 0.95
  },

  // VIN (Vehicle Identification Number) — 17 chars, excludes I, O, Q
  {
    id: 'vin',
    name: 'VIN',
    pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
    validator: vinCheck,
    confidence: 0.95
  },

  // MAC Address — XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
  {
    id: 'mac-address',
    name: 'MAC_ADDRESS',
    pattern: /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g,
    confidence: 0.92
  },
  
  // Date of Birth - Various formats
  {
    id: 'dob-au',
    name: 'DATE_OF_BIRTH_AU',
    pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[012])[/-](?:19|20)\d{2}\b/g,
    confidence: 0.80,
    country: ['AU']
  },
  {
    id: 'dob-nz',
    name: 'DATE_OF_BIRTH_NZ',
    pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[012])[/-](?:19|20)\d{2}\b/g,
    confidence: 0.80,
    country: ['NZ']
  },
  {
    id: 'dob-uk',
    name: 'DATE_OF_BIRTH_UK',
    pattern: /\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[012])[/-](?:19|20)\d{2}\b/g,
    confidence: 0.80,
    country: ['UK']
  },
  
  // UK Postcode
  {
    id: 'uk-postcode',
    name: 'UK_POSTCODE',
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?[ -]?\d[A-Z]{2}\b/gi,
    confidence: 0.90,
    country: ['UK']
  },
  
  // AU/NZ Postcode (4-digit)
  {
    id: 'anz-postcode',
    name: 'ANZ_POSTCODE',
    pattern: /\b\d{4}\b/g,
    confidence: 0.70,
    country: ['AU', 'NZ']
  },
  
  // Australian Address Patterns (common formats)
  {
    id: 'au-address',
    name: 'AU_ADDRESS',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Place|Pl|Drive|Dr|Lane|Ln|Circuit|Cct)\b/gi,
    confidence: 0.75,
    country: ['AU']
  },

  // NZ Address Patterns
  {
    id: 'nz-address',
    name: 'NZ_ADDRESS',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Place|Pl|Drive|Dr|Lane|Ln|Terrace|Tce|Crescent|Cres)\b/gi,
    confidence: 0.75,
    country: ['NZ']
  },

  // UK Address Patterns
  {
    id: 'uk-address',
    name: 'UK_ADDRESS',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Place|Pl|Drive|Dr|Lane|Ln|Close|Cl|Way|Court|Ct|Gardens|Gdns|Terrace|Tce|Crescent|Cres)\b/gi,
    confidence: 0.75,
    country: ['UK']
  },

  // AU Passport (letter + 7 digits, e.g. N1234567 or PA1234567)
  {
    id: 'au-passport',
    name: 'AU_PASSPORT',
    pattern: /\b[A-Z]{1,2}\d{7}\b/g,
    confidence: 0.80,
    country: ['AU']
  },

  // NZ Passport (2 letters + 6-7 digits, e.g. LA123456 or LF0123456)
  {
    id: 'nz-passport',
    name: 'NZ_PASSPORT',
    pattern: /\b[A-Z]{2}\d{6,7}\b/g,
    confidence: 0.80,
    country: ['NZ']
  },

  // NZ NHI (National Health Index) — 3 letters + 4 digits (e.g. ZAC1234)
  {
    id: 'nz-nhi',
    name: 'NZ_NHI',
    pattern: /\b[A-HJ-NP-Z]{3}\d{4}\b/g,
    confidence: 0.92,
    country: ['NZ']
  },

  // UK NHS Number — 10 digits in 3-3-4 format with modulus 11 check
  {
    id: 'uk-nhs',
    name: 'UK_NHS',
    pattern: /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g,
    validator: ukNhsCheck,
    confidence: 0.92,
    country: ['UK']
  },

  // NZ Bank Account — BB-bbbb-AAAAAAA-SSS (bank-branch-account-suffix)
  {
    id: 'nz-bank-account',
    name: 'NZ_BANK_ACCOUNT',
    pattern: /\b\d{2}[ -]?\d{4}[ -]?\d{7}[ -]?\d{2,3}\b/g,
    confidence: 0.88,
    country: ['NZ']
  },

  // Contextual: Medical Record Numbers (keyword + identifier)
  {
    id: 'medical-record-number',
    name: 'MEDICAL_RECORD_NUMBER',
    pattern: /(?:MRN|Medical Record|Patient ID|Patient No|Chart No|Record No|Hospital No|Health Record|UR No|URN|Unit Record)[:\s#\-./]*[A-Z0-9][-A-Z0-9]{2,}/gi,
    confidence: 0.90
  },

  // Contextual: Certificate and Licence Numbers (keyword + identifier)
  {
    id: 'certificate-licence-number',
    name: 'CERTIFICATE_LICENCE_NUMBER',
    pattern: /(?:Licen[cs]e|Certificate|Registration|Accreditation|Permit)\s*(?:No|Number|Num|#|ID)[:\s#\-./]*[A-Z0-9][-A-Z0-9]{2,}/gi,
    confidence: 0.88
  },
];
