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
\ue000<16-char-hex-id>\ue001
  │                      │
  prefix                 suffix
```

The 16-character hex ID is generated from a UUID v4, providing a token space of 16^16 (~18.4 quintillion) possible unique tokens. In practice this is limitless — you will never run out of tokens regardless of how much data you process.

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

- **SQLite** — Persistent, supports TTL-based expiry with automatic cleanup

Each session stores:
- `sessionId` — Unique identifier
- `tokens[]` — Array of `{ original, tokenized, type, category }` entries
- `createdAt` / `expiresAt` — Timestamps for TTL management

Sessions default to a 1-hour TTL and can be extended via the API.

## Deduplication

When storing tokens, Anonamoose deduplicates by original value (case-insensitive). If "John Smith" is detected multiple times in the same session, it's only stored once in the session data.

## Streaming rehydration

For streaming responses (SSE), Anonamoose rehydrates tokens in each chunk as it arrives. The full token-to-original mapping is available in memory from the request phase, so rehydration adds minimal latency to the stream.

## How LLMs handle the tokens

The PUA characters are valid Unicode that LLM tokenizers encode normally. The LLM doesn't know what they mean, but it treats them as opaque placeholders within the sentence structure. When it receives:

```
Summarise the case for ￰a1b2c3d4e5f6g7h8￱ (￰b2c3d4e5f6g7h8a1￱), MRN: ￰c3d4e5f6g7h8a1b2￱
```

It can still reason about the structure — there's a person, an email in brackets, and a medical record number. It just can't see the actual values. When it generates a response like "The case for ￰a1b2c3d4e5f6g7h8￱ shows...", Anonamoose replaces the tokens back to the original values on the way out.

### What works well

- **Summarisation, classification, sentiment analysis** — The meaning of the text doesn't depend on knowing the specific PII values, so these tasks work as normal.
- **Entity relationships** — The LLM can still tell that one token is the person associated with another token because the sentence structure is intact.
- **Multi-turn conversations** — Tokens are consistent within a session, so the LLM sees the same placeholder for "John Smith" every time and can track references across messages.
- **Drafting and generation** — The LLM generates text around the tokens naturally. "Dear ￰a1b2c3d4e5f6g7h8￱, thank you for your enquiry" becomes "Dear John Smith, thank you for your enquiry" after rehydration.

### What doesn't work

- **Reasoning about the content of the PII itself** — For example, "what country is this phone number from?" will fail because the LLM sees a token, not digits.
- **Spelling or formatting tasks on PII values** — "Capitalise the customer's name" won't work since the name is replaced.
- **Calculations involving redacted numbers** — If a numeric value is redacted, the LLM can't perform arithmetic on it.

These are edge cases where the task specifically requires the LLM to reason about the redacted data — which is exactly the data you don't want the LLM to have. For the vast majority of LLM use cases, the impact on response quality is negligible.

## Capacity

Each token uses a 16-character hex ID derived from UUID v4, giving a token space of approximately **18.4 quintillion** (16^16) unique tokens. There is no practical limit on the number of PII values that can be redacted — you will not run out of tokens.

Within a single session, each unique PII value gets its own token. The same value appearing multiple times in the same session reuses the same token (deduplication). Different sessions generate independent token sets.
