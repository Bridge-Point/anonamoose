---
title: Compliance Overview
description: How Anonamoose helps meet regulatory and compliance requirements for data privacy.
---

Anonamoose is purpose-built to prevent personally identifiable information (PII) from reaching third-party LLM APIs. This makes it directly relevant to several data privacy and security frameworks.

## The core problem

When organizations send data to LLM APIs (OpenAI, Anthropic, etc.), they are transmitting potentially sensitive data to a third party. Depending on the data involved and the jurisdiction, this can create compliance violations:

- **Healthcare data** sent to an LLM API without a Business Associate Agreement violates HIPAA
- **EU personal data** transferred to US-based LLM providers raises GDPR transfer concerns
- **Financial data** containing credit card numbers may violate PCI DSS
- **Customer PII** shared with third parties without appropriate controls fails SOC 2 audits

## How Anonamoose addresses this

Anonamoose sits between your application and the LLM API as a transparent proxy. Before any request leaves your network:

1. PII is detected using a four-layer pipeline (dictionary, NER, regex, name detection)
2. Each PII value is replaced with a unique, meaningless token
3. The sanitized request is forwarded to the LLM API
4. When the response returns, tokens are replaced with the original values

The LLM never sees the original PII. The token mappings never leave your infrastructure (stored locally in SQLite).

## Supported frameworks

| Framework | Relevance | Details |
|-----------|-----------|---------|
| [HIPAA](/compliance/hipaa/) | PHI de-identification before LLM processing | Automatically detects 14 of 18 Safe Harbor identifiers |
| [GDPR](/compliance/gdpr/) | Data minimization and international transfer controls | Articles 5, 25, 32, 44-49 |
| [SOC 2](/compliance/soc2/) | Confidentiality and privacy trust service criteria | CC6.7, P3.1, P6.1, P6.5, C1.1 |
| [ISO 27001](/compliance/iso27001/) | Information security management controls | A.8.2, A.10.1, A.13.2, A.14.1 |

## Self-hosted deployment model

Anonamoose is designed to run within your own infrastructure. This is important for compliance because:

- PII token mappings are stored in a local SQLite database, never transmitted externally
- The proxy intercepts requests before they leave your network boundary
- No data is sent to Anonamoose's developers or any third party
- You maintain full control over data retention and deletion (session TTL, manual purge)

This means the compliance boundary stays within your organization. You don't need a Data Processing Agreement with Anonamoose — it's your software running on your servers.

## What Anonamoose does NOT replace

Anonamoose is a technical control, not a complete compliance program. You still need:

- Organizational policies and procedures
- Staff training on data handling
- Risk assessments and documentation
- Legal review of your specific use case
- Audit processes and evidence collection

Anonamoose handles the technical layer — preventing PII from reaching LLM APIs. The organizational and procedural layers are your responsibility.
