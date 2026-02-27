<p align="center">
  <img src="assets/logo.png" alt="Anonamoose — Privacy Proxy for AI" width="500">
</p>

<p align="center">
  <a href="https://github.com/Bridge-Point/anonamoose/actions/workflows/ci.yml"><img src="https://github.com/Bridge-Point/anonamoose/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://bridge-point.github.io/anonamoose/coverage/"><img src="https://bridge-point.github.io/anonamoose/coverage/badge.svg" alt="Coverage"></a>
</p>

> **License:** Anonamoose is built and maintained by [BridgePoint](https://bridgepoint.co.nz) and licensed under [Business Source License 1.1](./LICENSE). Free for personal projects and non-commercial use. Commercial use (including offering as a hosted service) requires a commercial licence from BridgePoint. Contact [ben@bridgepoint.co.nz](mailto:ben@bridgepoint.co.nz).

**A drop-in proxy that strips PII from LLM requests before they leave your network. Also works as a standalone redaction API.**

Point your OpenAI or Anthropic SDK at Anonamoose instead of the upstream API. PII is automatically redacted from every request, forwarded to the LLM, and rehydrated in the response. One line of configuration. No code changes.

```python
# Before — PII goes straight to OpenAI
client = OpenAI(base_url="https://api.openai.com/v1")

# After — PII is stripped before it leaves your network
client = OpenAI(base_url="http://localhost:3000/v1")
```

Don't need an LLM? Use the direct redaction API to strip PII from any text — no upstream provider required:

```bash
curl -X POST http://localhost:3000/api/v1/redact \
  -H "Content-Type: application/json" \
  -d '{"text": "Patient John Smith (john@acme.com) called from 0412 345 678"}'
```

## Features

- **Drop-in proxy** — Change the base URL and everything works. OpenAI and Anthropic API-compatible. Full streaming support.
- **Standalone redaction API** — Strip PII from any text via `/api/v1/redact` without proxying to an LLM. Use for data pipelines, log processing, data export, or any workflow that needs PII removed.
- **Four-layer detection pipeline** — Dictionary (guaranteed) → Local AI/NER (transformer) → Regex (deterministic) → Name detection (safety net)
- **Guaranteed redaction** — Dictionary rules provide 100% recall. If you add a term, it will always be caught.
- **Local AI (NER)** — `bert-base-NER` (F1: 91.3) running natively in Node.js via ONNX. No Python, no external API calls. Automatic chunking for long texts.
- **Regional patterns** — AU, NZ, UK, and US patterns for government IDs, phone numbers, bank accounts, addresses, and more. Many with checksum validation (Luhn, TFN, Medicare, IRD, NHS).
- **HIPAA Safe Harbor** — Detection patterns for all 16 text-applicable Safe Harbor categories including contextual patterns for MRNs and licence numbers.
- **Self-hosted** — SQLite storage, local NER model, no telemetry. PII never leaves your infrastructure.
- **Runtime configuration** — Change detection settings, NER model, locale, and confidence thresholds without restarting. Admin panel included.
- **Management API** — Dictionary CRUD, session management, stats, and settings on a separate port.
- **n8n integration** — Custom node for workflow automation.

## Quick start

```bash
git clone https://github.com/Bridge-Point/anonamoose.git
cd anonamoose
npm install
```

Create a `.env` file:

```bash
API_TOKEN=your-api-token          # Protects management API and admin panel
```

Run:

```bash
npm run build
npm start
```

Proxy on port **3000**, management API on port **3001**.

### Try it

```bash
# Direct redaction
curl -X POST http://localhost:3000/api/v1/redact \
  -H "Content-Type: application/json" \
  -d '{"text": "Call John Smith at john@example.com or 0412 345 678"}'

# Proxy to OpenAI (PII stripped automatically)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Summarise: John Smith (john@acme.com) called about order #12345"}]
  }'
```

## Docker

```bash
cd docker
docker-compose up -d
```

## How it works

```
Your app                    Anonamoose                       LLM API
   │                            │                               │
   │  "Call John Smith at       │                               │
   │   john@acme.com"           │                               │
   │ ─────────────────────────▶ │                               │
   │                            │                               │
   │              Redact PII:   │                               │
   │              John Smith → ░░░░░                            │
   │              john@acme.com → ░░░░░                         │
   │                            │                               │
   │                            │  "Call ░░░░░ at ░░░░░"        │
   │                            │ ────────────────────────────▶ │
   │                            │                               │
   │                            │  "I'll contact ░░░░░ at…"    │
   │                            │ ◀──────────────────────────── │
   │                            │                               │
   │              Rehydrate:    │                               │
   │              ░░░░░ → John Smith                            │
   │              ░░░░░ → john@acme.com                         │
   │                            │                               │
   │  "I'll contact John Smith  │                               │
   │   at john@acme.com…"       │                               │
   │ ◀───────────────────────── │                               │
```

**Layer 1 — Dictionary** (confidence: 1.0): Guaranteed redaction. Any term you add is always found and replaced.

**Layer 2 — Local AI / NER** (confidence: 0.50–0.99): Transformer-based Named Entity Recognition detecting persons, organizations, locations. Long texts automatically chunked.

**Layer 3 — Regex** (confidence: 0.70–0.98): Deterministic patterns for structured PII — emails, phone numbers, government IDs, credit cards, URLs, IP addresses, VINs, and more. Many with checksum validation.

**Layer 4 — Name detection** (confidence: 0.50–0.85): Database of ~10,000 known first names cross-referenced against English dictionary. Safety net for names NER missed.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Proxy server port |
| `MGMT_PORT` | `3001` | Management API port |
| `ANONAMOOSE_DB_PATH` | `./data/anonamoose.db` | SQLite database path |
| `API_TOKEN` | — | Bearer token for management API and admin panel |
| `STATS_TOKEN` | — | Bearer token for stats-only access |
| `NER_MODEL_CACHE` | — | Custom cache directory for the NER model |

## Testing

227 tests across 8 suites.

```bash
npm test                # run all tests
npm run test:coverage   # run with coverage report
```

## Documentation

Full documentation at [docs.anonamoose.net](https://docs.anonamoose.net).

- [What is Anonamoose?](https://docs.anonamoose.net/what-is-anonamoose/) — Overview and the problem it solves
- [Getting Started](https://docs.anonamoose.net/getting-started/) — Install and first request
- [Proxy Usage](https://docs.anonamoose.net/guides/proxy/) — SDK examples for OpenAI and Anthropic
- [PII Patterns](https://docs.anonamoose.net/reference/pii-patterns/) — All detection patterns by region
- [Compliance](https://docs.anonamoose.net/compliance/overview/) — HIPAA, GDPR, SOC 2, ISO 27001

## Built by BridgePoint

Anonamoose is built and maintained by [BridgePoint](https://bridgepoint.co.nz), a software consultancy based in New Zealand.

## License

[Business Source License 1.1](./LICENSE) — (c) 2026 BridgePoint Ltd.

**Non-commercial use is permitted.** You may use, copy, modify, and redistribute Anonamoose for personal projects, research, education, and internal evaluation.

**Commercial use requires a licence.** If you or your organisation are using Anonamoose to generate revenue, provide services to customers, or operate as part of a business (including not-for-profits and offering it as a hosted service), you need a commercial licence from BridgePoint.

Contact [ben@bridgepoint.co.nz](mailto:ben@bridgepoint.co.nz) or visit [bridgepoint.co.nz](https://bridgepoint.co.nz) for commercial licensing.
