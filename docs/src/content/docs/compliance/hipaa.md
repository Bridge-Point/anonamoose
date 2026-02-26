---
title: HIPAA Compliance
description: How Anonamoose enables HIPAA-compliant use of LLM APIs by de-identifying Protected Health Information.
---

HIPAA (Health Insurance Portability and Accountability Act) restricts how Protected Health Information (PHI) can be used and disclosed. Most LLM API providers do not sign Business Associate Agreements (BAAs) for standard API access, which means sending PHI to these APIs violates HIPAA.

Anonamoose eliminates this problem by stripping PHI from requests before they reach the LLM.

## The problem

Healthcare organizations want to use LLMs for clinical documentation, patient communication, coding assistance, and administrative tasks. But these workflows often involve PHI:

- Patient names, dates of birth, medical record numbers
- Contact information (phone, email, address)
- Government IDs (SSN, Medicare numbers)

Under HIPAA §164.502, a covered entity may not disclose PHI to a third party unless specific conditions are met — typically requiring a BAA. LLM API providers generally do not offer BAAs for their standard API tiers.

**Without Anonamoose:** PHI is sent directly to the LLM API, creating a HIPAA violation.

**With Anonamoose:** PHI is replaced with meaningless tokens before the request leaves your network. The LLM processes de-identified data. No BAA with the LLM provider is needed because no PHI is disclosed.

## Safe Harbor de-identification

HIPAA §164.514(b) defines the "Safe Harbor" method of de-identification, which requires removing 18 categories of identifiers. Anonamoose's four-layer pipeline covers these identifiers as follows:

| # | Identifier | Anonamoose Coverage | Detection Method |
|---|-----------|-------------------|-----------------|
| 1 | Names | Covered | NER (PERSON), Names layer, Dictionary |
| 2 | Geographic data smaller than state | Covered | Regex (postcodes, addresses), NER (LOC) |
| 3 | Dates (except year) for ages >89 | Covered | Regex (DOB patterns for AU/NZ/UK formats) |
| 4 | Phone numbers | Covered | Regex (AU/NZ/UK/US formats, landline + mobile) |
| 5 | Fax numbers | Covered | Regex (same patterns as phone) |
| 6 | Email addresses | Covered | Regex |
| 7 | Social Security numbers | Covered | Regex (US SSN format with validation) |
| 8 | Medical record numbers | Partial | Dictionary (add known formats as custom terms) |
| 9 | Health plan beneficiary numbers | Partial | Dictionary, Regex (AU Medicare with checksum) |
| 10 | Account numbers | Covered | Regex (bank accounts, BSB, sort codes) |
| 11 | Certificate/license numbers | Partial | Regex (UK driving licence), Dictionary for others |
| 12 | Vehicle identifiers | Partial | Dictionary (add as custom terms) |
| 13 | Device identifiers | Partial | Dictionary (add as custom terms) |
| 14 | Web URLs | Partial | Dictionary (add as custom terms) |
| 15 | IP addresses | Covered | Regex |
| 16 | Biometric identifiers | Not applicable | Not text-based |
| 17 | Full-face photographs | Not applicable | Not text-based |
| 18 | Other unique identifiers | Partial | Dictionary (add as custom terms) |

**Summary:** 10 of 18 identifiers are automatically detected. 6 can be covered by adding organization-specific formats to the dictionary. 2 are not applicable to text processing.

### Closing the gaps

For identifiers marked "Partial", add your organization's specific formats to the dictionary for guaranteed redaction:

```bash
curl -X POST http://localhost:3000/api/v1/dictionary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "entries": [
      { "term": "MRN-", "caseSensitive": false, "wholeWord": false },
      { "term": "https://", "caseSensitive": false, "wholeWord": false }
    ]
  }'
```

The dictionary layer runs first and provides guaranteed redaction — if a term is in the dictionary, it will always be caught.

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

5. **Populate the dictionary** — Add organization-specific identifiers (MRN formats, internal patient IDs, facility names) to the dictionary for guaranteed redaction.

6. **Audit regularly** — Use the admin panel's Redaction Inspector to verify that PHI is being caught. Review the request logs and recent redactions.

7. **Document your configuration** — Maintain records of which detection layers are enabled, dictionary entries, and NER confidence thresholds as part of your HIPAA compliance documentation.

## Limitations

- Anonamoose processes text content only. Images, audio, and binary attachments are passed through unmodified.
- The NER model runs locally and does not achieve 100% recall. The dictionary layer exists to guarantee redaction of known terms.
- Anonamoose de-identifies data at the proxy layer. It does not encrypt data at rest beyond standard filesystem permissions. Use disk encryption for the SQLite database if required.
- HIPAA compliance is an organizational responsibility. Anonamoose is a technical control that supports compliance — it does not make your organization HIPAA-compliant on its own.
