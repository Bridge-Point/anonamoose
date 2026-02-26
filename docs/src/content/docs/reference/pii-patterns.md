---
title: PII Patterns
description: All PII patterns detected by the regex layer, organized by country.
---

The regex layer detects PII using deterministic patterns. Many include validators (e.g. Luhn check for credit cards, checksum validation for TFN/Medicare/NHS) to reduce false positives.

Use the [locale setting](/guides/configuration/) to restrict which regional patterns run. When a locale is set (e.g. `AU`), only universal patterns and patterns tagged for that region are applied.

## Universal

These patterns always run regardless of locale setting.

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Email | `email` | 0.95 | — |
| Credit Card | `credit-card` | 0.95 | Luhn checksum |
| IP Address | `ip-address` | 0.85 | — |
| IBAN | `iban` | 0.95 | — |

## Australia

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-au` | 0.90 | — |
| Phone (Mobile) | `phone-au-mobile` | 0.92 | — |
| TFN (Tax File Number) | `au-tfn` | 0.95 | Modulus 11 checksum |
| Medicare | `au-medicare` | 0.95 | Position-weighted checksum |
| ABN (Australian Business Number) | `au-abn` | 0.90 | — |
| Passport | `au-passport` | 0.80 | — |
| Bank Account (BSB + Account) | `au-bank-account` | 0.85 | — |
| Postcode | `anz-postcode` | 0.70 | — |
| Date of Birth | `dob-au` | 0.80 | — |
| Address | `au-address` | 0.75 | — |

### TFN validation

The Australian Tax File Number uses a modulus 11 algorithm with position weights `[1, 2, 3, 4, 5, 6, 7, 8, 10]`. Only 9-digit numbers that pass the checksum are matched.

### Medicare validation

Medicare numbers use a position-weighted checksum with weights `[1, 3, 7, 9, 1, 3, 7, 9, 1, 3]`. Only 10-digit numbers that pass are matched.

### Passport format

Australian passports use 1-2 letters followed by 7 digits (e.g. `N1234567`, `PA1234567`).

### Not covered by regex

**Driver's licence** — Australian licence numbers vary significantly by state (NSW: 8 digits, VIC: 8-10 digits, QLD: alphanumeric). Due to the high false-positive risk of generic numeric patterns, add your specific licence formats to the [dictionary](/guides/dictionary/) for guaranteed redaction.

## New Zealand

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-nz` | 0.90 | — |
| Phone (Mobile) | `phone-nz-mobile` | 0.92 | — |
| IRD (Inland Revenue) | `nz-ird` | 0.95 | Weighted checksum |
| NHI (National Health Index) | `nz-nhi` | 0.92 | — |
| Passport | `nz-passport` | 0.80 | — |
| Bank Account | `nz-bank-account` | 0.88 | — |
| Postcode | `anz-postcode` | 0.70 | — |
| Date of Birth | `dob-nz` | 0.80 | — |
| Address | `nz-address` | 0.75 | — |

### IRD validation

NZ IRD numbers (8-9 digits) use a weighted checksum with weights `[3, 2, 7, 6, 5, 4, 3, 2]`.

### NHI format

NZ National Health Index numbers use 3 letters (excluding I and O) followed by 4 digits (e.g. `ZAC1234`). This is a healthcare identifier used across the NZ health system.

### Passport format

NZ passports use 2 letters followed by 6-7 digits (e.g. `LA123456`, `LF0123456`).

### Bank account format

NZ bank accounts follow the format: bank (2 digits) - branch (4 digits) - account (7 digits) - suffix (2-3 digits). For example: `01-0102-0123456-00`.

### Not covered by regex

**Driver's licence** — NZ licence numbers overlap in format with passport numbers and are typically covered by the NZ passport pattern. For specific licence card numbers, add them to the [dictionary](/guides/dictionary/).

## United Kingdom

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone (Landline) | `phone-uk` | 0.88 | — |
| Phone (Mobile) | `phone-uk-mobile` | 0.92 | — |
| NINO (National Insurance) | `uk-nino` | 0.98 | Format validation |
| NHS Number | `uk-nhs` | 0.92 | Modulus 11 checksum |
| Passport | `uk-passport` | 0.75 | Range validation |
| Driving Licence | `uk-driving-licence` | 0.85 | — |
| Sort Code | `uk-sort-code` | 0.80 | — |
| Postcode | `uk-postcode` | 0.90 | — |
| Date of Birth | `dob-uk` | 0.80 | — |
| Address | `uk-address` | 0.75 | — |

### NHS validation

NHS numbers are 10 digits validated using a modulus 11 algorithm with weights `[10, 9, 8, 7, 6, 5, 4, 3, 2]`. Invalid checksums are rejected.

## United States

| Pattern | ID | Confidence | Validator |
|---------|----|-----------|-----------|
| Phone | `phone-us` | 0.90 | — |
| SSN (Social Security Number) | `ssn-us` | 0.90 | — |

US patterns are tagged with the `US` locale. When no locale is set, they run alongside all other regional patterns.

## Confidence scores

Each pattern has a confidence score between 0 and 1 indicating how likely a match is a true positive:

- **0.95+** — High confidence, validated patterns (TFN, Medicare, credit cards, NINO)
- **0.85–0.94** — Good confidence, specific format patterns (phone numbers, NHI, NHS, bank accounts)
- **0.70–0.84** — Moderate confidence, potentially ambiguous patterns (postcodes, dates, passports)

Lower-confidence patterns may produce false positives on short numeric strings. The dictionary layer (confidence 1.0) should be used for terms that must never be missed.

## Locale filtering

Set the `locale` setting to restrict which patterns run:

| Locale | Patterns applied |
|--------|-----------------|
| `null` (default) | All patterns (AU + NZ + UK + US + universal) |
| `AU` | Australian patterns + universal |
| `NZ` | New Zealand patterns + universal |
| `UK` | United Kingdom patterns + universal |
| `US` | United States patterns + universal |

Configure via the [Settings API](/reference/api/#settings) or the [Admin Panel](/guides/dashboard/#settings).
