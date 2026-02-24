# Anonamoose

[![CI](https://github.com/Bridge-Point/anonamoose/actions/workflows/ci.yml/badge.svg)](https://github.com/Bridge-Point/anonamoose/actions/workflows/ci.yml)
[![Coverage](https://bridge-point.github.io/anonamoose/coverage/badge.svg)](https://bridge-point.github.io/anonamoose/coverage/)

> **License Notice:** Anonamoose is free for personal projects and non-commercial use. If you or your organisation are using Anonamoose to generate revenue, provide services to customers, or operate as part of a business (including not-for-profits), you need a commercial license. Contact [ben@bridgepoint.co.nz](mailto:ben@bridgepoint.co.nz) for licensing. See [LICENSE](./LICENSE) for full terms.

LLM Anonymization Proxy — Guaranteed PII Redaction with Rehydration.

Anonamoose sits between your application and upstream LLM APIs (OpenAI, Anthropic). It intercepts requests, redacts PII via a three-layer pipeline, forwards the sanitized request, and rehydrates (restores) original values in the response before returning it to the client.

## Features

- **Guaranteed redaction** — Dictionary rules provide 100% recall. If you add a term, it will always be redacted.
- **Three-layer pipeline** — Dictionary (guaranteed) → Regex (deterministic) → NER (probabilistic, transformer-based)
- **Transformer NER** — `bert-base-NER` (F1: 91.3) running natively in Node.js via `@huggingface/transformers`. No Python dependency.
- **Full rehydration** — Unicode PUA tokens allow deterministic restoration of original values after LLM processing
- **Drop-in proxy** — Point your OpenAI or Anthropic SDK at Anonamoose. Full SSE streaming support.
- **AU/NZ/UK patterns** — TFN, Medicare, IRD, NINO, credit cards (Luhn validated), phones, emails, DOB, and more
- **Management API** — Dictionary CRUD, session management, and stats on a separate port
- **n8n integration** — Custom node for workflow automation

## Quick Start

```bash
git clone https://github.com/Bridge-Point/anonamoose.git
cd anonamoose
npm install
```

Create a `.env` file:

```bash
OPENAI_API_KEY=sk-...             # Optional
ANTHROPIC_API_KEY=sk-ant-...      # Optional
REDIS_URL=redis://localhost:6379  # Optional, defaults to in-memory
API_TOKEN=your-api-token          # Optional, protects management endpoints
STATS_TOKEN=your-stats-token      # Required for /api/v1/stats
```

Run:

```bash
npm run build
npm start
```

The proxy starts on port **3000** and the management API on port **3001**.

## Docker

```bash
cd docker
docker-compose up -d
```

This starts Anonamoose, Redis, and the Stats Dashboard.

## How It Works

```
App → Anonamoose Proxy → LLM API
         ↓                    ↓
    Redact PII           Process text
    (3 layers)           (no PII exposed)
         ↓                    ↓
    Store token          Return response
    mappings                  ↓
         ←←← Rehydrate ←←←←←←
         ↓
    Return original
    values to app
```

**Layer 1 — Dictionary** (confidence: 1.0): Any term you add is always found and replaced. Zero misses.

**Layer 2 — Regex** (confidence: 0.70–0.98): Deterministic patterns for structured PII — emails, phone numbers, government IDs, credit cards, postcodes, IPs, etc.

**Layer 3 — NER** (confidence: 0.50–0.99): Transformer-based Named Entity Recognition detecting persons, organizations, locations, and misc entities. Loads lazily on first request.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Proxy server port |
| `MGMT_PORT` | `3001` | Management API port |
| `OPENAI_API_KEY` | — | OpenAI API key for proxy passthrough |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for proxy passthrough |
| `REDIS_URL` | — | Redis connection URL (in-memory if not set) |
| `API_TOKEN` | — | Bearer token for management API |
| `STATS_TOKEN` | — | Bearer token for stats endpoint |
| `NER_MODEL_CACHE` | — | Custom cache directory for the NER model |

## Testing

159 tests across 7 suites — **99.5% statement coverage**.

```bash
npm test                # run all tests
npm run test:coverage   # run with coverage report
```

| Module | Statements | Branches | Functions | Lines |
|--------|-----------|----------|-----------|-------|
| `redaction/pipeline.ts` | 100% | 100% | 100% | 100% |
| `redaction/regex-layer.ts` | 100% | 100% | 100% | 100% |
| `redaction/dictionary.ts` | 100% | 100% | 100% | 100% |
| `redaction/tokenizer.ts` | 100% | 100% | 100% | 100% |
| `redaction/ner-layer.ts` | 96% | 90% | 100% | 96% |
| `rehydration/store.ts` | 100% | 97% | 100% | 100% |

Test suites cover:
- **Regex patterns** — AU/NZ/UK/US phone numbers, emails, government IDs (TFN, IRD, NINO, SSN), credit cards (Luhn), bank accounts, postcodes, IP addresses, dates
- **Dictionary** — exact match, case-insensitive, multi-word, custom category
- **Tokenizer** — Unicode PUA token generation, uniqueness, replacement
- **NER** — transformer entity detection (PERSON, ORG, LOCATION), BIO tag merging, WordPiece subwords, confidence filtering, circuit breaker
- **Pipeline** — full three-layer integration with synthetic PII scenarios
- **Rehydration store** — in-memory and Redis (mocked) session storage, TTL, cleanup, eviction

## Documentation

Full documentation at [docs.anonamoose.net](https://docs.anonamoose.net).

## License

[Business Source License 1.1](./LICENSE) — (c) 2024 Bridge Point Ltd.

Non-commercial use is permitted. Commercial use (including offering as a hosted service) requires a commercial license. Contact [ben@bridgepoint.co.nz](mailto:ben@bridgepoint.co.nz).

On 2030-02-23, the license converts to [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).
