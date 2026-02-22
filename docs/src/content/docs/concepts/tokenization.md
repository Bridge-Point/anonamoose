---
title: Tokenization & Rehydration
description: How PII is replaced with tokens and restored after LLM processing.
---

When Anonamoose detects PII, it replaces each value with a **tokenized placeholder** — a unique string that the LLM treats as an opaque token. After the LLM processes the text, the tokens are replaced with the original values (rehydration).

## Unicode Private Use Area tokens

Anonamoose uses characters from the **Unicode Private Use Area (PUA)** — specifically `U+E000` and `U+E001` — as delimiters for placeholder tokens:

```
Original:  "Call John Smith at john@example.com"
Tokenized: "Call \ue000a1b2c3d4\ue001 at \ue000e5f6g7h8\ue001"
```

Each placeholder has the format:

```
\ue000<8-char-uuid>\ue001
  │                   │
  prefix              suffix
```

The 8-character ID is generated from a UUID v4, ensuring uniqueness within a session.

## Why PUA characters?

PUA characters are ideal for tokenization because:

1. **LLMs treat them as opaque tokens** — They have no semantic meaning in any language, so the LLM doesn't try to interpret them
2. **No collision risk** — PUA characters don't appear in normal text, so there's no chance of false matches during rehydration
3. **Minimal context pollution** — The short token format adds minimal noise to the LLM's context window
4. **Deterministic replacement** — Each unique PII value gets a unique token, so rehydration is exact

## Token lifecycle

```
1. Detection
   "John Smith" found by dictionary layer

2. Token generation
   Generate: \ue000a1b2c3d4\ue001

3. Storage
   Session "abc-123": { "\ue000a1b2c3d4\ue001" → "John Smith" }

4. Replacement
   Input:  "Call John Smith"
   Output: "Call \ue000a1b2c3d4\ue001"

5. LLM processing
   LLM sees tokens as opaque strings, processes around them

6. Rehydration
   LLM output: "I'll contact \ue000a1b2c3d4\ue001"
   Rehydrated: "I'll contact John Smith"
```

## Session storage

Token mappings are stored in sessions, keyed by a session ID:

- **In-memory** (default) — Fast, but lost on restart
- **Redis** — Persistent, supports TTL-based expiry

Each session stores:
- `sessionId` — Unique identifier
- `tokens[]` — Array of `{ original, tokenized, type, category }` entries
- `createdAt` / `expiresAt` — Timestamps for TTL management

Sessions default to a 1-hour TTL and can be extended via the API.

## Deduplication

When storing tokens, Anonamoose deduplicates by original value (case-insensitive). If "John Smith" is detected multiple times in the same session, it's only stored once in the session data.

## Streaming rehydration

For streaming responses (SSE), Anonamoose rehydrates tokens in each chunk as it arrives. The full token-to-original mapping is available in memory from the request phase, so rehydration adds minimal latency to the stream.
