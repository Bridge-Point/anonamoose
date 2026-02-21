# Anonamoose - LLM Anonymization Proxy

## Project Overview

**Anonamoose** is an open-source anonymization proxy for LLM applications that provides:
- Guaranteed PII redaction via dictionary-based rules
- Algorithmic PII detection (regex + NER)
- Tokenized placeholder system for rehydration
- Passthrough proxy for OpenAI and Anthropic APIs
- n8n integration node
- Stats dashboard with shadcn UI

**Mission**: Guarantee redaction where Microsoft Presidio fails - specifically by allowing explicit dictionary-based rules that are NEVER bypassed by probabilistic detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Anonamoose Proxy                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────────┐  │
│  │   Client     │───▶│  Request        │───▶│  Redaction Pipeline  │  │
│  │  (SDK/curl) │    │  Interceptor    │    │                      │  │
│  └──────────────┘    └─────────────────┘    │  1. Dictionary       │  │
│                                               │  2. Regex Patterns   │  │
│  ┌──────────────┐    ┌─────────────────┐    │  3. NER Detection    │  │
│  │   Upstream   │◀───│  Response       │◀───│  4. Tokenize          │  │
│  │  LLM API     │    │  Interceptor    │    │     Placeholders      │  │
│  └──────────────┘    └─────────────────┘    └──────────────────────┘  │
│                                                      │                   │
│                                    ┌────────────────┘                   │
│                                    ▼                                    │
│                         ┌─────────────────────┐                         │
│                         │  Rehydration Store  │                         │
│                         │  (In-memory/Redis)  │                         │
│                         └─────────────────────┘                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     REST Management API                         │   │
│  │  - Dictionary CRUD (guaranteed redaction words)                │   │
│  │  - Stats endpoint (protected by STATS_TOKEN)                  │   │
│  │  - Session hydration                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Stats Dashboard (UI)                        │   │
│  │  - Next.js with shadcn components                              │   │
│  │  - Protected by STATS_TOKEN                                    │   │
│  │  - Real-time stats updates                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Features

### 1. Three-Layer Redaction Pipeline

| Layer | Type | Behavior | Use Case |
|-------|------|----------|----------|
| **Dictionary** | Guaranteed | MUST redact - 100% recall on specified terms | Customer names, internal projects |
| **Regex** | Deterministic | High precision on known patterns | SSN, credit cards, emails, phones |
| **NER** | Probabilistic | Context-aware detection via compromise.js | Names, organizations, locations |

### 2. Supported PII Patterns

**Australian:**
- Phone (landline/mobile) - Multiple formats
- TFN (Tax File Number) - With checksum validation
- Medicare - With checksum validation
- ABN (Australian Business Number)
- Bank Account (BSB + Account)
- Postcode

**New Zealand:**
- Phone (landline/mobile)
- IRD (Inland Revenue Department)
- Postcode

**UK:**
- Phone (landline/mobile)
- NINO (National Insurance Number)
- Passport
- Driving Licence
- Sort Code
- Postcode

**Universal:**
- Email
- Credit Card (with Luhn validation)
- SSN (US)
- IP Address
- Date of Birth

### 3. Tokenized Placeholders

Uses Unicode Private Use Area characters to create placeholders that look like tokens to the LLM:
- `"John Smith"` → `"󀀀TOKEN_0󀀁"`
- Reduces context pollution
- Deterministic rehydration

### 4. Proxy Passthrough

- **OpenAI**: `/v1/chat/completions`
- **Anthropic**: `/v1/messages`
- Full streaming support
- Headers: `x-anonamoose-session`, `x-anonamoose-redact`, `x-anonamoose-hydrate`

### 5. Authentication

- **API_TOKEN**: Protects management endpoints (`/api/v1/*`)
- **STATS_TOKEN**: Protects stats endpoint (`/api/v1/stats`) and dashboard

---

## API Endpoints

### Proxy Endpoints

```
POST /v1/chat/completions     # OpenAI-compatible
POST /v1/messages             # Anthropic-compatible
POST /api/v1/redact           # Direct redaction
```

### Management Endpoints (Protected by API_TOKEN)

```
GET    /api/v1/dictionary              # List dictionary
POST   /api/v1/dictionary              # Add terms
DELETE /api/v1/dictionary              # Remove terms
POST   /api/v1/sessions/:id/hydrate   # Hydrate text
GET    /api/v1/stats                   # Stats (requires STATS_TOKEN)
GET    /api/v1/stats/public            # Public limited stats
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Proxy port (default: 3000) |
| `MGMT_PORT` | No | Management port (default: 3001) |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `REDIS_URL` | No | Redis connection URL |
| `API_TOKEN` | No | Token for management API auth |
| `STATS_TOKEN` | Yes* | Token for stats endpoint (*required for protected stats) |

---

## Deployment

### Docker Compose

```bash
cd docker
docker-compose up -d
```

Services:
- `anonamoose` - Main proxy (port 3000)
- `redis` - Session storage
- `ui` - Stats dashboard (port 3002)

### Environment Setup

```bash
# Required for stats
export STATS_TOKEN=your-secure-token

# Optional
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export REDIS_URL=redis://localhost:6379
export API_TOKEN=your-api-token
```

---

## Project Structure

```
anonamoose/
├── src/
│   ├── core/
│   │   ├── redaction/
│   │   │   ├── dictionary.ts    # Guaranteed redaction layer
│   │   │   ├── regex-layer.ts   # Regex patterns (AU/NZ/UK)
│   │   │   ├── ner-layer.ts     # NER via compromise.js
│   │   │   ├── tokenizer.ts     # Placeholder tokenization
│   │   │   └── pipeline.ts      # Redaction orchestration
│   │   ├── rehydration/
│   │   │   └── store.ts         # Session store (Redis/in-memory)
│   │   └── types.ts
│   ├── proxy/
│   │   └── server.ts            # Express proxy + API
│   └── n8n/
│       ├── nodes/Anonamoose/    # n8n custom node
│       └── credentials/         # n8n credentials
├── ui/                          # Next.js dashboard
├── docker/                      # Dockerfiles
├── tests/                       # Test files
└── SPEC.md
```

---

## n8n Integration

### Install Node

```bash
cd src/n8n
npm link
# In n8n directory
npm link anonamoose
```

### Node Operations

- **Redact Text** - Redact PII from text
- **Hydrate Text** - Restore redacted text
- **Add Dictionary Entry** - Add guaranteed redaction terms
- **List Dictionary** - View all terms
- **Proxy Request** - Forward LLM requests
- **Get Stats** - View redaction statistics

---

## Testing

```bash
npm test           # Run all tests
npm run build      # Build TypeScript
```

---

## License

This project source code is available under the Business Source License (BSL 1.1). See LICENSE file for details.

---

## Comparison: Anonamoose vs Microsoft Presidio

| Aspect | Microsoft Presidio | Anonamoose |
|--------|-------------------|------------|
| **Guaranteed Redaction** | No | Yes - dictionary layer |
| **Tokenization** | Simple placeholders | Tokenized (PUA chars) |
| **Streaming** | Limited | Full support |
| **Rehydration** | Not native | Built-in |
| **Proxy** | Not included | Full passthrough |
| **n8n** | No node | Custom node |
| **AU/NZ/UK Support** | Limited | Comprehensive |
| **Stats Dashboard** | No | Yes (shadcn) |

---

*Generated: February 2026*
