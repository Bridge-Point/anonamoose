---
title: How It Works
description: Architecture overview of the Anonamoose anonymization proxy.
---

Anonamoose sits between your application and upstream LLM APIs. It intercepts requests, redacts PII, forwards the sanitized request, and rehydrates the response before returning it.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Anonamoose Proxy                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client ──▶ Request Interceptor ──▶ Redaction Pipeline      │
│                                     │                       │
│                                     ├─ 1. Dictionary        │
│                                     ├─ 2. Local AI (NER)    │
│                                     ├─ 3. Regex Patterns    │
│                                     ├─ 4. Name Detection    │
│                                     └─ 5. Tokenize          │
│                                                             │
│  Upstream LLM ◀── Response Interceptor ◀── Forward          │
│                        │                                    │
│                        ▼                                    │
│                 Rehydration Store                            │
│                 (SQLite)                                     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │              REST Management API                   │     │
│  │  Dictionary · Sessions · Settings · Stats · Logs   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Admin Panel (Next.js)                 │     │
│  │  Dashboard · Logs · Inspector · Dictionary · Settings│   │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Request flow

1. **Client sends request** — Your application sends a chat completion request to Anonamoose instead of directly to OpenAI/Anthropic
2. **Redaction** — The four-layer pipeline scans every message for PII:
   - Dictionary terms are replaced first (guaranteed)
   - Local AI (NER) detects named entities using a transformer model
   - Regex patterns catch structured PII (emails, phone numbers, etc.)
   - Name detection catches common first names from known name lists
3. **Tokenization** — Each detected PII value is replaced with a Unicode Private Use Area token (e.g. `\ue000a1b2c3d4\ue001`)
4. **Storage** — The token-to-original mapping is stored in a session (SQLite)
5. **Forward** — The sanitized request is forwarded to the upstream LLM API
6. **Rehydration** — When the response arrives, tokens in the LLM output are replaced with their original values
7. **Return** — The rehydrated response is sent back to the client

## Components

### Proxy server (`src/proxy/server.ts`)

Express server handling OpenAI and Anthropic endpoints. Supports both `/v1/chat/completions` and `/chat/completions` path formats. Manages request/response interception and streaming.

### Redaction pipeline (`src/core/redaction/pipeline.ts`)

Orchestrates the four detection layers in order: dictionary, NER, regex, names. Each layer receives the output of the previous, so already-redacted content is not double-matched.

### Rehydration store (`src/core/rehydration/store.ts`)

Stores session data with token mappings in SQLite. Sessions have configurable TTL with automatic cleanup. Data persists across restarts.

### Admin panel (`ui/`)

Next.js dashboard with request logs, redaction inspector, dictionary management, runtime settings, and session management. Authenticated via `API_TOKEN`.

### Management API

REST API for dictionary management, session operations, settings, and stats. Runs on a separate port for security isolation.

## Ports

| Port | Default | Purpose |
|------|---------|---------|
| Proxy | 3000 | LLM proxy endpoints and direct redaction |
| Management | 3001 | Dictionary, sessions, stats, settings API |
| Dashboard | 3002 | Admin panel and stats UI (Docker Compose) |
