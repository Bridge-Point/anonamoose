---
title: HIPAA Compliance
description: How Anonamoose supports HIPAA compliance by reducing PHI exposure when using LLM APIs.
---

HIPAA (Health Insurance Portability and Accountability Act) restricts how Protected Health Information (PHI) can be used and disclosed. Most LLM API providers do not sign Business Associate Agreements (BAAs) for standard API access, which means sending PHI to these APIs creates compliance risk.

Anonamoose significantly reduces this risk by detecting and removing PHI from requests before they reach the LLM. It is a defence-in-depth technical control — not a compliance guarantee.

## The problem

Healthcare organizations want to use LLMs for clinical documentation, patient communication, coding assistance, and administrative tasks. But these workflows often involve PHI:

- Patient names, dates of birth, medical record numbers
- Contact information (phone, email, address)
- Government IDs (SSN, Medicare numbers)

Under HIPAA §164.502, a covered entity may not disclose PHI to a third party unless specific conditions are met — typically requiring a BAA. LLM API providers generally do not offer BAAs for their standard API tiers.

**Without Anonamoose:** PHI is sent directly to the LLM API with no technical safeguard.

**With Anonamoose:** PHI is detected and replaced with meaningless tokens before the request leaves your network. The LLM processes de-identified data. This significantly reduces the risk of PHI disclosure, though no automated system achieves 100% detection.

## Safe Harbor de-identification

HIPAA §164.514(b) defines the "Safe Harbor" method of de-identification, which requires removing 18 categories of identifiers. Anonamoose's four-layer pipeline provides detection patterns for all 16 text-applicable categories:

| # | Identifier | Detection | Notes |
|---|-----------|-----------|-------|
| 1 | Names | NER (PERSON), Names layer, Dictionary | NER recall is ~90-95%, not 100%. Add known names to dictionary for guaranteed detection. |
| 2 | Geographic data smaller than state | Regex (postcodes, addresses), NER (LOC) | Structured formats only. Free-text locations like "the clinic on Main" depend on NER. |
| 3 | Dates (except year) for ages >89 | Regex (DD/MM/YYYY, DD-MM-YYYY) | Only matches structured date formats, not "March fifteenth" or similar. |
| 4 | Phone numbers | Regex (AU/NZ/UK/US formats) | Structured formats with country codes. Does not catch "oh-four-one-two...". |
| 5 | Fax numbers | Regex (same patterns as phone) | Same limitations as phone. |
| 6 | Email addresses | Regex | High confidence. |
| 7 | Social Security numbers | Regex (XXX-XX-XXXX) | Format-based only. No checksum validator — may false-positive on similar patterns. |
| 8 | Medical record numbers | Contextual regex (MRN, Patient ID, Chart No, etc.) | Only detects when preceded by a keyword label. Unlabelled MRNs will not be caught — add known formats to dictionary. |
| 9 | Health plan beneficiary numbers | Regex (AU Medicare, NZ NHI, UK NHS) | Checksum-validated where applicable. |
| 10 | Account numbers | Regex (AU BSB, NZ bank, UK sort codes) | Structured formats only. |
| 11 | Certificate/license numbers | Contextual regex (Licence/Certificate/Registration No), UK driving licence, AU/NZ/UK passports | Only detects labelled identifiers. Unlabelled licence numbers require dictionary. |
| 12 | Vehicle identifiers | Regex (VIN with check digit) | Standard 17-character VIN only. Custom vehicle IDs require dictionary. |
| 13 | Device identifiers | Regex (MAC addresses) | MAC addresses only. Serial numbers and UDIs require dictionary. |
| 14 | Web URLs | Regex (HTTP/HTTPS) | High confidence. |
| 15 | IP addresses | Regex (IPv4 with validation, IPv6) | High confidence. |
| 16 | Biometric identifiers | Not applicable | Not text-based. |
| 17 | Full-face photographs | Not applicable | Not text-based. |
| 18 | Other unique identifiers | Dictionary | No automatic detection — add as custom dictionary terms. |

### Important: detection is not removal

Safe Harbor requires that identifiers are *removed*. Anonamoose *detects and replaces* identifiers using pattern matching and machine learning. No automated detection system achieves 100% recall. Specifically:

- **NER (names, locations, organizations)** — Runs a local transformer model with approximately 90-95% recall depending on text style. Unusual names, misspellings, and non-standard formatting reduce accuracy.
- **Contextual patterns (MRN, licence numbers)** — Only match when a keyword label is present. `MRN: 12345678` is caught; `12345678` alone is not.
- **Regex patterns** — Match structured formats only. Free-text representations ("oh-four-one-two", "born on the third of March") are not detected.

**Anonamoose reduces PHI exposure. It does not eliminate it.** Treat it as one layer of a defence-in-depth approach, not as a standalone Safe Harbor implementation.

### Maximising detection accuracy

The dictionary layer provides **guaranteed** redaction — if a term is in the dictionary, it will always be caught regardless of format or context. For HIPAA use cases, populate the dictionary aggressively:

```bash
curl -X POST http://localhost:3000/api/v1/dictionary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "entries": [
      { "term": "MRN-", "caseSensitive": false, "wholeWord": false },
      { "term": "Dr Smith", "caseSensitive": false, "wholeWord": true },
      { "term": "Mercy Hospital", "caseSensitive": false, "wholeWord": true }
    ]
  }'
```

Add:
- All staff names (doctors, nurses, admin)
- Facility names and department names
- Known MRN prefixes and patient ID formats
- Any other organization-specific identifiers

The more terms in the dictionary, the closer you get to complete coverage.

### Testing before production

Use the **Redaction Inspector** in the admin panel to test with representative data before going live. Paste real-world examples (with consent or using test data) and verify that all PHI is being caught. If something is missed, add it to the dictionary.

## HIPAA Security Rule alignment

Beyond de-identification, Anonamoose's architecture supports several HIPAA Security Rule requirements:

### §164.312(a) — Access controls

- Management API is protected by `API_TOKEN` authentication
- Admin panel requires token-based login
- Session data is only accessible with valid credentials

### §164.312(c) — Integrity controls

- Token mappings are stored in SQLite with atomic transactions
- Each PII value maps to a unique token, ensuring exact restoration
- Sessions have automatic TTL expiry

### §164.312(d) — Person or entity authentication

- All management endpoints require bearer token authentication
- Admin panel uses session-based authentication with automatic expiry

### §164.312(e) — Transmission security

- Anonamoose supports deployment behind TLS-terminating reverse proxies
- PII is stripped before data leaves the network boundary
- Token mappings are never transmitted externally

## Deployment recommendations for HIPAA

1. **Deploy within your security boundary** — Run Anonamoose on infrastructure you control (your VPS, your cloud VPC). The SQLite database containing token mappings must stay within your HIPAA-covered environment.

2. **Use TLS everywhere** — Deploy behind a reverse proxy with TLS termination. All communication between your application and Anonamoose should be encrypted.

3. **Set session TTL appropriately** — Default is 1 hour. For HIPAA, consider shorter TTLs or purging sessions after use to minimize the window where PHI mappings exist.

4. **Enable all detection layers** — Run with dictionary, NER, regex, and name detection all enabled for maximum coverage.

5. **Populate the dictionary aggressively** — Add all known staff names, facility names, MRN formats, internal patient IDs, and any other organization-specific identifiers. The dictionary is your strongest guarantee.

6. **Test with representative data** — Use the Redaction Inspector with realistic examples before processing real PHI. Identify gaps and add dictionary terms to fill them.

7. **Monitor in production** — Review the recent redactions log in the admin panel regularly. Look for PHI that may have been missed and add corrective dictionary entries.

8. **Document your configuration** — Maintain records of which detection layers are enabled, dictionary entries, NER confidence thresholds, and testing results as part of your HIPAA compliance documentation.

## Limitations

Anonamoose is a technical control that significantly reduces PHI exposure. It has inherent limitations:

- **Not 100% recall.** No automated PII detection system catches everything. The NER model, regex patterns, and contextual patterns all have edge cases where PHI can pass through undetected. The dictionary layer compensates by providing guaranteed detection of known terms.
- **Text only.** Images, audio, PDFs, and binary attachments are passed through unmodified. If your workflows involve non-text PHI, you need additional controls.
- **Structured formats only.** Regex patterns match structured data (phone numbers, emails, dates in DD/MM/YYYY format). Free-text representations of the same information are not caught by regex — they depend on NER, which is probabilistic.
- **No encryption at rest.** Token mappings in the SQLite database contain original PHI values. Protect this database with disk encryption and access controls.
- **Organizational responsibility.** HIPAA compliance requires policies, training, risk assessments, incident response plans, and BAAs where applicable. Anonamoose is one technical control within a broader compliance program — it does not make your organization HIPAA-compliant on its own.
