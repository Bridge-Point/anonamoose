---
title: What is Anonamoose?
description: A drop-in proxy that strips PII from LLM requests before they leave your network.
---

Anonamoose is a **drop-in proxy** that sits between your application and LLM APIs (OpenAI, Anthropic). It automatically strips personally identifiable information from every request before it leaves your network, and restores it in the response. Your code doesn't change. The LLM never sees the real data.

## The problem

Every time your application sends a prompt to an LLM API, you're transmitting data to a third party. If that data contains names, emails, phone numbers, medical records, or any other PII, you've just shared it with a company you don't control.

This creates real problems:

- **Compliance violations** — HIPAA, GDPR, SOC 2, and ISO 27001 all restrict how PII can be shared with third parties. Most LLM providers don't sign BAAs or DPAs for standard API access.
- **Data breach risk** — PII sitting in an LLM provider's logs, training data, or infrastructure is data you can't secure or delete.
- **Customer trust** — Users don't expect their personal information to be sent to external AI services.

The usual workaround is "don't send sensitive data to LLMs", which means either manually sanitizing every prompt (impractical) or not using LLMs for workflows that involve real customer data (wasteful).

## The solution: a transparent proxy

Anonamoose solves this by intercepting LLM API calls at the network level. You change one line of configuration — the base URL — and everything else stays the same.

**Before (direct to OpenAI):**
```python
client = OpenAI(
    api_key="sk-...",
    base_url="https://api.openai.com/v1"  # PII goes straight to OpenAI
)
```

**After (through Anonamoose):**
```python
client = OpenAI(
    api_key="sk-...",
    base_url="http://localhost:3000/v1"  # PII is stripped before it leaves
)
```

That's it. No SDK changes. No wrapper functions. No prompt engineering. Your existing OpenAI and Anthropic code works exactly as before — Anonamoose is API-compatible with both providers.

## What happens to a request

```
Your app                    Anonamoose                       OpenAI
   │                            │                               │
   │  "Summarise the case for   │                               │
   │   John Smith (john@acme.   │                               │
   │   com), MRN: 12345678"     │                               │
   │ ─────────────────────────▶ │                               │
   │                            │                               │
   │              Redact PII:   │                               │
   │              John Smith → ░░░░░                            │
   │              john@acme.com → ░░░░░                         │
   │              MRN: 12345678 → ░░░░░                         │
   │                            │                               │
   │                            │  "Summarise the case for      │
   │                            │   ░░░░░ (░░░░░), MRN: ░░░░░" │
   │                            │ ────────────────────────────▶ │
   │                            │                               │
   │                            │  "The case for ░░░░░ shows…"  │
   │                            │ ◀──────────────────────────── │
   │                            │                               │
   │              Rehydrate:    │                               │
   │              ░░░░░ → John Smith                            │
   │                            │                               │
   │  "The case for John Smith  │                               │
   │   shows…"                  │                               │
   │ ◀───────────────────────── │                               │
```

The LLM processes the request and generates a useful response — it just never sees the actual PII. The meaning of the prompt is preserved because the tokens are consistent within the session.

## Why a proxy, not a library

You could build PII stripping into your application code, but a proxy approach has specific advantages:

- **One integration point** — Every service that calls an LLM API gets protection by routing through the proxy. No need to instrument each codebase individually.
- **Language-agnostic** — Works with Python, Node.js, Go, Ruby, or anything that makes HTTP requests. If it can set a base URL, it works with Anonamoose.
- **Separation of concerns** — Your application logic doesn't need to know about PII detection. The proxy handles it at the network layer.
- **Consistent policy** — Redaction rules, dictionary entries, and detection settings apply uniformly to all traffic, managed centrally via the admin panel.
- **Existing tooling works** — n8n workflows, LangChain agents, custom scripts — anything that uses the standard OpenAI or Anthropic SDK just works by changing the base URL.
- **Audit trail** — Every redaction is logged centrally with what was detected, what type of PII it was, and the confidence level.

## What it detects

Anonamoose uses a four-layer detection pipeline:

| Layer | Method | What it catches | Guarantee |
|-------|--------|----------------|-----------|
| **Dictionary** | Exact match | Any term you add (names, codenames, IDs) | 100% — if it's in the dictionary, it's caught |
| **Local AI (NER)** | Transformer model | Person names, organizations, locations | ~90-95% recall, context-aware |
| **Regex** | Pattern matching | Emails, phones, credit cards, tax IDs, government numbers, IPs, URLs | Deterministic, many with checksum validation |
| **Name detection** | Name database | Common first names not caught by NER | ~10,000 known names cross-referenced against English dictionary |

The layers run in sequence. Dictionary provides guaranteed coverage for known terms. NER catches names and entities in natural language. Regex detects structured identifiers. Name detection is a final safety net. No PII value is detected or replaced twice.

Regional patterns are included for **Australia, New Zealand, United Kingdom, and United States**, and can be filtered via the `locale` setting so only relevant patterns run.

## Self-hosted, no external dependencies

Anonamoose runs entirely within your infrastructure:

- **SQLite** for session and settings storage — no external database needed
- **Local NER model** — the transformer runs in-process via ONNX, no API calls to any ML service
- **No telemetry, no phoning home** — PII token mappings never leave your server
- **Single Node.js process** — runs on a $5/month VPS or in a Docker container alongside your application

This matters for compliance. The data stays in your network. You don't need a DPA with anyone. You control retention, deletion, and access.

## What it supports

| Feature | Status |
|---------|--------|
| OpenAI Chat Completions (`/v1/chat/completions`) | Supported |
| OpenAI Embeddings (`/v1/embeddings`) | Supported |
| OpenAI Models (`/v1/models`) | Supported |
| Anthropic Messages (`/v1/messages`) | Supported |
| Streaming responses | Supported |
| Per-request session pinning | Supported |
| Per-request redaction/rehydration toggle | Supported |
| Per-request locale override | Supported |
| Direct redaction API (`/api/v1/redact`) | Supported |
| Direct rehydration API (`/api/v1/hydrate`) | Supported |
| Admin panel with redaction inspector | Supported |
| Runtime settings (no restart needed) | Supported |
| Docker / Docker Compose deployment | Supported |

## Who it's for

- **Teams using LLMs with customer data** who need a technical control to prevent PII leaking to third-party APIs
- **Healthcare and finance organisations** that need to demonstrate compliance controls for LLM usage
- **Developers building LLM-powered features** who want PII protection without rewriting their application code
- **Companies with existing LLM integrations** (n8n, LangChain, custom apps) that want to add PII protection retroactively

## Next steps

- [Getting Started](/getting-started/) — Install and make your first redacted request in under five minutes
- [Proxy Usage](/guides/proxy/) — SDK examples for OpenAI and Anthropic
- [Four-Layer Pipeline](/concepts/three-layer-pipeline/) — How the detection layers work together
- [Compliance Overview](/compliance/overview/) — HIPAA, GDPR, SOC 2, and ISO 27001 mapping
