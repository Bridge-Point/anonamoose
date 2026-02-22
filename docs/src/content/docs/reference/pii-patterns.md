---
title: PII Patterns
description: All PII patterns detected by the regex layer, organized by country.
---

The regex layer detects PII using deterministic patterns. Many include validators (e.g. Luhn check for credit cards, checksum validation for TFN/Medicare) to reduce false positives.

## Universal

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Email | `email` | 0.95 | — |
| Credit Card | `credit-card` | 0.95 | Luhn checksum |
| SSN (US) | `ssn-us` | 0.90 | — |
| IP Address | `ip-address` | 0.85 | — |
| IBAN | `iban` | 0.95 | — |
| Phone (US) | `phone-us` | 0.90 | — |

## Australia

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-au` | 0.90 | — |
| Phone (Mobile) | `phone-au-mobile` | 0.92 | — |
| TFN (Tax File Number) | `au-tfn` | 0.95 | Modulus 11 checksum |
| Medicare | `au-medicare` | 0.95 | Position-weighted checksum |
| ABN (Australian Business Number) | `au-abn` | 0.90 | — |
| Bank Account (BSB + Account) | `au-bank-account` | 0.85 | — |
| Postcode | `au-postcode` | 0.70 | — |
| Date of Birth | `dob-au` | 0.80 | — |
| Address | `au-address` | 0.75 | — |

### TFN validation

The Australian Tax File Number uses a modulus 11 algorithm with position weights `[1, 2, 3, 4, 5, 6, 7, 8, 10]`. Only 9-digit numbers that pass the checksum are matched.

### Medicare validation

Medicare numbers use a position-weighted checksum with weights `[1, 3, 7, 9, 1, 3, 7, 9, 1, 3]`. Only 10-digit numbers that pass are matched.

## New Zealand

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-nz` | 0.90 | — |
| Phone (Mobile) | `phone-nz-mobile` | 0.92 | — |
| IRD (Inland Revenue) | `nz-ird` | 0.95 | Weighted checksum |
| Postcode | `nz-postcode` | 0.70 | — |
| Date of Birth | `dob-nz` | 0.80 | — |

### IRD validation

NZ IRD numbers (8-9 digits) use a weighted checksum with weights `[3, 2, 7, 6, 5, 4, 3, 2]`.

## United Kingdom

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-uk` | 0.88 | — |
| Phone (Mobile) | `phone-uk-mobile` | 0.92 | — |
| NINO (National Insurance) | `uk-nino` | 0.98 | Format validation |
| Passport | `uk-passport` | 0.75 | — |
| Driving Licence | `uk-driving-licence` | 0.85 | — |
| Sort Code | `uk-sort-code` | 0.80 | — |
| Postcode | `uk-postcode` | 0.90 | — |
| Date of Birth | `dob-uk` | 0.80 | — |

## Confidence scores

Each pattern has a confidence score between 0 and 1 indicating how likely a match is a true positive:

- **0.95+** — High confidence, validated patterns (TFN, Medicare, credit cards)
- **0.85–0.94** — Good confidence, specific format patterns (phone numbers, bank accounts)
- **0.70–0.84** — Moderate confidence, potentially ambiguous patterns (postcodes, dates)

Lower-confidence patterns may produce false positives on short numeric strings. The dictionary layer (confidence 1.0) should be used for terms that must never be missed.
