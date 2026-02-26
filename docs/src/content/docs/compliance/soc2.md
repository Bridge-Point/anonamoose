---
title: SOC 2 Compliance
description: How Anonamoose supports SOC 2 Trust Service Criteria for confidentiality and privacy.
---

SOC 2 (System and Organization Controls 2) is an auditing framework developed by the AICPA that evaluates an organization's controls related to security, availability, processing integrity, confidentiality, and privacy. Organizations undergoing SOC 2 audits need to demonstrate appropriate controls over sensitive data — including when using third-party LLM APIs.

## The problem

When your application sends customer data to an LLM API, your SOC 2 auditor will ask:

- What confidential data is being shared with the third party?
- What controls exist to prevent unauthorized disclosure?
- How is data classified and protected before transmission?
- What monitoring exists for data leaving your boundary?

Without a technical control preventing sensitive data from reaching the LLM, answering these questions requires relying entirely on the LLM provider's controls and contractual commitments.

## Relevant Trust Service Criteria

### CC6.7 — Restricting transmission of confidential information

> The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes.

**How Anonamoose helps:**

- PII is stripped from requests before they leave your network boundary
- Only de-identified tokens are transmitted to the LLM provider
- The original data never leaves infrastructure you control
- Redaction can be selectively disabled per-request via headers, providing explicit authorization control
- All proxy requests are logged with timestamps, methods, paths, and response codes

### P3.1 — Collection limitation

> Personal information is collected consistent with the entity's objectives related to privacy.

**How Anonamoose helps:**

- The LLM provider receives no personal information — only meaningless tokens
- This effectively limits what the third party "collects" to non-personal, non-confidential data
- Token mappings are stored locally with automatic TTL expiry, limiting retention

### P6.1 — Disclosure to third parties

> Personal information is disclosed to third parties only for the purposes identified in the entity's privacy commitments and system requirements.

**How Anonamoose helps:**

- No personal information is disclosed to the LLM provider
- The proxy architecture enforces this as a technical control — it cannot be bypassed by individual developers unless redaction is explicitly disabled
- The admin panel provides visibility into what data is being redacted

### P6.5 — Unauthorized disclosure

> The entity obtains commitments from vendors and other third parties with access to personal information to notify the entity in the event of actual or suspected unauthorized disclosures of personal information.

**How Anonamoose helps:**

- Because no personal information reaches the LLM provider, the risk of unauthorized disclosure by the third party is eliminated for the PII categories Anonamoose detects
- This reduces the scope of vendor risk management for the LLM provider relationship

### C1.1 — Identification and maintenance of confidential information

> The entity identifies and maintains confidential information to meet the entity's objectives related to confidentiality.

**How Anonamoose helps:**

- The four-layer detection pipeline (dictionary, NER, regex, name detection) automatically identifies confidential information in outbound requests
- The dictionary layer allows explicit classification of organization-specific confidential terms
- Detection statistics are tracked and visible in the dashboard (PII detected by layer, total redactions)
- The Redaction Inspector allows testing and verification of classification rules

## Evidence for auditors

Anonamoose provides several artifacts useful for SOC 2 audits:

| Evidence type | Source |
|--------------|--------|
| **Control design** | Four-layer pipeline architecture documentation, default-on redaction |
| **Operating effectiveness** | Dashboard statistics (requests redacted, PII detected counts), request logs |
| **Monitoring** | Admin panel request logs, recent redactions log (last 15 minutes), Redaction Inspector |
| **Configuration management** | Settings API shows enabled layers, confidence thresholds, model selection |
| **Access controls** | API_TOKEN authentication for management endpoints, admin panel login |
| **Data retention** | Configurable session TTL, automatic expiry, manual purge capability |

### Sample audit narratives

**Control statement:** "Outbound requests to third-party LLM APIs are processed through Anonamoose, which identifies and replaces personally identifiable information with non-reversible tokens before transmission. The original data is stored in a local database with automatic expiry."

**Test of operating effectiveness:** "Selected a sample of proxy requests from the request log. For each request, verified that the redaction log shows PII detections were processed. Reviewed dashboard statistics confirming consistent redaction activity. Tested the Redaction Inspector with sample PII data and confirmed detection across all four layers."

## Deployment recommendations for SOC 2

1. **Enable all detection layers** — Run with dictionary, NER, regex, and name detection all enabled to demonstrate defence in depth.

2. **Populate the dictionary** — Add organization-specific confidential terms (customer IDs, internal project names, proprietary terms) to the dictionary.

3. **Monitor the dashboard** — Review redaction statistics regularly. A sudden drop in detections may indicate a configuration issue.

4. **Retain request logs** — The request log provides an audit trail. Consider exporting logs to your SIEM for long-term retention.

5. **Document the control** — Include Anonamoose in your system description as a technical control for data classification and transmission restriction.

6. **Test regularly** — Use the Redaction Inspector to verify detection effectiveness as part of your control monitoring program.

## Limitations

- Anonamoose is a technical control, not a complete SOC 2 program. It addresses specific Trust Service Criteria related to confidentiality and privacy.
- SOC 2 requires organizational controls (policies, training, vendor management) that are outside the scope of any single tool.
- The request log is an in-memory circular buffer with configurable retention. For long-term audit trails, export logs to persistent storage.
- Anonamoose processes text content only. Images, audio, and binary attachments are passed through unmodified.
