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
| IP Address (IPv4) | `ip-address` | 0.90 | Octet range validation (0-255) |
| IP Address (IPv6) | `ipv6-address` | 0.90 | — |
| URL | `url` | 0.95 | — |
| VIN (Vehicle Identification Number) | `vin` | 0.95 | Check digit validation (position 9) |
| MAC Address | `mac-address` | 0.92 | — |
| IBAN | `iban` | 0.95 | — |
| Medical Record Number | `medical-record-number` | 0.90 | Contextual (keyword + value) |
| Certificate/Licence Number | `certificate-licence-number` | 0.88 | Contextual (keyword + value) |

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

## Universal pattern details

### IP Address validation

**IPv4** addresses are validated to ensure each octet is in the range 0-255. The pattern `999.999.999.999` would be matched by the regex but rejected by the validator.

**IPv6** addresses match full (`2001:0db8:...`), abbreviated (`fe80::1`, `::1`), and other standard forms.

### URL detection

Matches `http://` and `https://` URLs including paths, query strings, and fragments. Stops at whitespace and common delimiters (`"`, `'`, `>`, `)`, `]`).

### VIN validation

Vehicle Identification Numbers are exactly 17 characters, using alphanumeric characters excluding I, O, and Q. The check digit at position 9 is validated using the standard transliteration and weighting algorithm:

- Characters are transliterated to numeric values (A=1, B=2, ..., excluding I, O, Q)
- Position weights: `[8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]`
- The weighted sum modulo 11 must equal the check digit (0-9 or X for 10)

This validation eliminates false positives from random 17-character strings.

### MAC Address detection

Matches MAC addresses in both colon-separated (`00:1A:2B:3C:4D:5E`) and hyphen-separated (`00-1A-2B-3C-4D-5E`) formats. Each octet is exactly 2 hex digits.

### Contextual patterns

These patterns use keyword anchoring rather than format matching. They detect when a recognizable label (e.g. "MRN:", "Licence No:") is followed by an alphanumeric identifier.

**Medical Record Number** matches these keyword prefixes:

`MRN`, `Medical Record`, `Patient ID`, `Patient No`, `Chart No`, `Record No`, `Hospital No`, `Health Record`, `UR No`, `URN`, `Unit Record`

Followed by a separator (`:`, `#`, `-`, space) and an alphanumeric value of 3+ characters.

Examples: `MRN: 12345678`, `Patient ID: P-12345`, `Chart No: CH-44556`

**Certificate/Licence Number** matches these keyword prefixes:

`Licence`, `License`, `Certificate`, `Registration`, `Accreditation`, `Permit`

Followed by a qualifier (`No`, `Number`, `#`, `ID`) and an alphanumeric value of 3+ characters.

Examples: `Licence No: DL-987654`, `Certificate #: CERT-789`, `Registration Number: REG-00123`

These contextual patterns complete HIPAA Safe Harbor coverage for identifiers #8 (medical record numbers) and #11 (certificate/licence numbers). For unlabelled identifiers with known formats, add them to the [dictionary](/guides/dictionary/) for guaranteed detection.

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
