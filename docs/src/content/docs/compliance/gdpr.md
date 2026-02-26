---
title: GDPR Compliance
description: How Anonamoose supports GDPR compliance when using LLM APIs by minimizing personal data exposure.
---

The General Data Protection Regulation (GDPR) governs how personal data of EU/EEA individuals is collected, processed, and transferred. Sending personal data to LLM API providers — especially those based outside the EU — raises significant GDPR concerns.

Anonamoose addresses this by stripping personal data from requests before they leave your infrastructure.

## The problem

When your application sends prompts containing personal data to an LLM API, you are:

1. **Disclosing personal data to a third party** (the API provider)
2. **Potentially transferring data internationally** (if the provider processes data outside the EU/EEA)
3. **Losing control over data retention** (the provider may log or store request data)

Each of these creates GDPR obligations that are difficult to meet with standard LLM API agreements.

## Relevant GDPR articles

### Article 5 — Principles relating to processing

| Principle | How Anonamoose helps |
|-----------|---------------------|
| **Data minimization** (Art. 5(1)(c)) | Only de-identified data reaches the LLM. Personal data is replaced with meaningless tokens before transmission. |
| **Storage limitation** (Art. 5(1)(e)) | Token mappings have configurable TTL (default 1 hour). Sessions expire automatically. |
| **Integrity and confidentiality** (Art. 5(1)(f)) | Personal data stays within your infrastructure. The LLM provider never receives it. |

### Article 25 — Data protection by design and by default

Anonamoose implements data protection by design:

- **By design:** The proxy architecture ensures personal data is stripped before any external transmission. There is no configuration that would allow PII to bypass redaction (unless explicitly disabled per-request via headers).
- **By default:** All four detection layers (dictionary, NER, regex, name detection) are enabled by default. Redaction is on by default for all proxy requests.

### Article 32 — Security of processing

| Requirement | Anonamoose implementation |
|-------------|--------------------------|
| Pseudonymization | PII is replaced with unique tokens (pseudonymized). Original values are stored locally and can be restored via rehydration. |
| Confidentiality | Token mappings are stored in a local SQLite database, never transmitted externally. Management API requires authentication. |
| Resilience | Self-hosted deployment means no dependency on external anonymization services. SQLite provides durable storage with atomic transactions. |
| Regular testing | The Redaction Inspector in the admin panel allows testing redaction effectiveness at any time. |

### Articles 44–49 — International transfers

This is where Anonamoose provides the most direct GDPR benefit.

**The transfer problem:** Most major LLM providers (OpenAI, Anthropic) process data in the United States. Transferring personal data from the EU to the US requires adequate safeguards under Chapter V of the GDPR — Standard Contractual Clauses, adequacy decisions, or binding corporate rules.

**Anonamoose's solution:** If no personal data reaches the LLM provider, there is no personal data transfer to regulate. The data sent to the API contains only de-identified tokens, which are not personal data under GDPR (Recital 26 — information which does not relate to an identified or identifiable natural person).

This significantly simplifies the international transfer analysis:

| Without Anonamoose | With Anonamoose |
|--------------------|-----------------|
| Personal data transferred to US-based provider | Only de-identified tokens transferred |
| Requires SCCs or adequacy decision | No personal data transfer — Chapter V may not apply |
| Provider's DPA must cover LLM processing | Standard API terms sufficient for non-personal data |
| Data subject rights extend to provider | No personal data held by provider |

## Data Processing Agreement (DPA)

Anonamoose is self-hosted software that runs on your infrastructure. Because it is not a service provided by a third party:

- **No DPA is needed with Anonamoose's developers** — the software runs entirely within your control
- **Your DPA with the LLM provider is simplified** — you are only sending de-identified data, reducing the scope of personal data processing

## Data subject rights

GDPR grants data subjects rights over their personal data. Anonamoose supports these through its session management:

| Right | Implementation |
|-------|---------------|
| **Right to erasure** (Art. 17) | Delete specific sessions via `DELETE /api/v1/sessions/:id` or all sessions via `DELETE /api/v1/sessions`. Token mappings are permanently removed. |
| **Right to access** (Art. 15) | Session search (`GET /api/v1/sessions/search?q=...`) can locate token mappings containing a specific individual's data. |
| **Storage limitation** | Sessions have configurable TTL. Expired sessions are automatically purged. |

## Deployment recommendations for GDPR

1. **Deploy within the EU/EEA** — Run Anonamoose on EU-based infrastructure to keep token mappings (which contain personal data) within the EU.

2. **Set appropriate session TTL** — Shorter TTLs reduce the window where personal data is stored. Consider purging sessions immediately after use if the response has been delivered.

3. **Document your processing** — Record Anonamoose in your Record of Processing Activities (ROPA) as a technical measure for data minimization.

4. **Conduct a DPIA** — If processing special category data (health, biometric, etc.), conduct a Data Protection Impact Assessment that includes Anonamoose as a mitigating control.

5. **Populate the dictionary** — Add organization-specific personal data patterns to the dictionary layer for guaranteed redaction.

6. **Monitor effectiveness** — Use the Redaction Inspector and recent redactions log in the admin panel to verify PII is being caught.

## Limitations

- Anonamoose processes text content only. Images, audio, and file attachments are passed through without modification.
- The NER model provides high but not 100% recall. The dictionary layer exists to guarantee redaction of known terms.
- Token mappings stored in the SQLite database are personal data (they contain the original PII values). Protect this database accordingly.
- GDPR compliance requires organizational measures beyond technical controls. Anonamoose addresses data minimization and pseudonymization — policies, training, and DPIAs are your responsibility.
