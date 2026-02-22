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
│                                     ├─ 2. Regex Patterns    │
│                                     ├─ 3. NER Detection     │
│                                     └─ 4. Tokenize          │
│                                                             │
│  Upstream LLM ◀── Response Interceptor ◀── Forward          │
│                        │                                    │
│                        ▼                                    │
│                 Rehydration Store                            │
│                 (In-memory / Redis)                          │
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │              REST Management API                   │     │
│  │  Dictionary CRUD · Session management · Stats      │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Request flow

1. **Client sends request** — Your application sends a chat completion request to Anonamoose instead of directly to OpenAI/Anthropic
2. **Redaction** — The three-layer pipeline scans every message for PII:
   - Dictionary terms are replaced first (guaranteed)
   - Regex patterns catch structured PII (emails, phone numbers, etc.)
   - NER detects named entities in context (optional)
3. **Tokenization** — Each detected PII value is replaced with a Unicode Private Use Area token (e.g. `\ue000a1b2c3d4\ue001`)
4. **Storage** — The token → original mapping is stored in a session (in-memory or Redis)
5. **Forward** — The sanitized request is forwarded to the upstream LLM API
6. **Rehydration** — When the response arrives, tokens in the LLM output are replaced with their original values
7. **Return** — The rehydrated response is sent back to the client

## Components

### Proxy server (`src/proxy/server.ts`)

Express server handling OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) endpoints. Manages request/response interception and streaming.

### Redaction pipeline (`src/core/redaction/pipeline.ts`)

Orchestrates the three detection layers in order: dictionary → regex → NER. Each layer receives the output of the previous, so already-redacted content is not double-matched.

### Rehydration store (`src/core/rehydration/store.ts`)

Stores session data with token mappings. Supports in-memory storage (default) and Redis for persistence. Sessions have configurable TTL with automatic cleanup.

### Management API

REST API for dictionary management, session operations, and stats. Runs on a separate port for security isolation.

## Ports

| Port | Default | Purpose |
|------|---------|---------|
| Proxy | 3000 | LLM proxy endpoints and direct redaction |
| Management | 3001 | Dictionary, sessions, stats API |
| Dashboard | 3002 | Stats UI (Docker Compose only) |
