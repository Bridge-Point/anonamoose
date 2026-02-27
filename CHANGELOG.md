# Changelog

## Unreleased

### Added

- **NER chunking for long texts** — The NER layer now automatically splits long inputs into overlapping chunks (1,000 chars with 200 char overlap) instead of silently skipping them. This removes the previous 10,000 character hard limit and ensures BERT's 512-token context window is used optimally for texts of any length.
- **Overlapping detection handling** — Both the regex and NER layers now properly handle overlapping detections by keeping the longest non-overlapping match, preventing garbled output when multiple patterns match the same text region.
- **Validator error handling** — Regex pattern validators are now wrapped in try-catch to prevent a single broken validator from crashing the entire redaction pipeline.
- **Locale-based regex filtering** — New `locale` setting (AU, NZ, UK, US) restricts regex patterns to a specific region, reducing false positives. Configurable via Settings API or admin panel.
- **Regional PII patterns** — Added NZ NHI, UK NHS (with modulus 11 checksum), AU/NZ passports, NZ bank accounts, NZ/UK addresses, US phone/SSN locale tagging.
- **HIPAA Safe Harbor patterns** — Added URL, VIN (with check digit validation), MAC address, IPv6, contextual medical record number, and contextual certificate/licence number patterns. Coverage now includes all 16 text-applicable Safe Harbor categories.
- **IPv4 validation** — IP addresses are now validated to ensure each octet is in range 0-255, reducing false positives.
- **Compliance documentation** — Added HIPAA, GDPR, SOC 2, and ISO 27001 compliance guides with honest coverage assessments and limitations.
- **PII patterns reference** — Comprehensive documentation of all regex patterns, validators, confidence scores, and locale filtering.

### Changed

- NER layer no longer has a hard input length limit (was 10,000 chars).
- IPv4 confidence raised from 0.85 to 0.90 with octet range validation.

### Removed

- AU/NZ driver's licence regex patterns (too generic, high false-positive risk — use dictionary instead).
