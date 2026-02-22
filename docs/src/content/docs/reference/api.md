---
title: API Reference
description: Complete API endpoint reference for Anonamoose.
---

All management endpoints are served on the management port (default `3001`) under `/api/v1/`. Proxy endpoints are served on the proxy port (default `3000`).

## Proxy endpoints

### `POST /v1/chat/completions`

OpenAI-compatible chat completions proxy. Redacts PII from messages before forwarding to OpenAI, rehydrates the response.

**Headers:**
- `Authorization: Bearer <openai-api-key>` — required
- `x-anonamoose-session: <session-id>` — optional, auto-generated if omitted
- `x-anonamoose-redact: true|false` — optional, default `true`
- `x-anonamoose-hydrate: true|false` — optional, default `true`

**Body:** Standard OpenAI chat completions request body. Supports `"stream": true`.

---

### `POST /v1/messages`

Anthropic-compatible messages proxy. Redacts PII from messages and system prompt before forwarding to Anthropic.

**Headers:**
- `Authorization: Bearer <anthropic-api-key>` — required
- `x-anonamoose-session: <session-id>` — optional
- `x-anonamoose-redact: true|false` — optional, default `true`
- `x-anonamoose-hydrate: true|false` — optional, default `true`

**Body:** Standard Anthropic messages request body. Supports `"stream": true`.

---

### `POST /api/v1/redact`

Direct redaction without proxying to an LLM.

**Body:**
```json
{ "text": "string to redact" }
```

**Response:**
```json
{
  "redactedText": "Call \ue000a1b2c3d4\ue001 at \ue000e5f6g7h8\ue001",
  "sessionId": "uuid",
  "detections": [
    {
      "type": "regex",
      "category": "EMAIL",
      "value": "john@example.com",
      "startIndex": 15,
      "endIndex": 31,
      "confidence": 0.95
    }
  ]
}
```

---

### `GET /health`

Health check endpoint.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-02-22T00:00:00.000Z" }
```

## Management endpoints

All management endpoints require `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is configured.

### Dictionary

#### `GET /api/v1/dictionary`

List all dictionary entries.

**Response:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "term": "John Smith",
      "caseSensitive": false,
      "wholeWord": true,
      "enabled": true,
      "createdAt": "2026-02-22T00:00:00.000Z"
    }
  ]
}
```

#### `POST /api/v1/dictionary`

Add dictionary entries.

**Body:**
```json
{
  "entries": [
    {
      "term": "John Smith",
      "caseSensitive": false,
      "wholeWord": true
    }
  ]
}
```

**Response:**
```json
{ "success": true, "count": 1 }
```

#### `DELETE /api/v1/dictionary`

Remove dictionary entries by ID.

**Body:**
```json
{ "ids": ["uuid1", "uuid2"] }
```

**Response:**
```json
{ "success": true }
```

### Sessions

#### `GET /api/v1/sessions`

List all active sessions.

#### `GET /api/v1/sessions/search?q=<query>`

Search sessions by original value, category, or metadata.

#### `GET /api/v1/sessions/:id`

Get a single session with all token mappings.

#### `DELETE /api/v1/sessions/:id`

Delete a single session.

#### `DELETE /api/v1/sessions`

Delete all sessions.

#### `POST /api/v1/sessions/:id/hydrate`

Rehydrate text using session token mappings.

**Body:**
```json
{ "text": "text with \ue000tokens\ue001 to rehydrate" }
```

**Response:**
```json
{ "text": "text with original values restored" }
```

#### `POST /api/v1/sessions/:id/extend`

Extend session TTL.

**Body:**
```json
{ "ttl": 7200 }
```

#### `POST /api/v1/sessions/:id/tokens`

Add tokens to a session manually.

**Body:**
```json
{
  "tokens": { "placeholder": "original_value" },
  "type": "dictionary",
  "category": "CUSTOM",
  "ttl": 3600
}
```

### Stats

#### `GET /api/v1/stats`

Full stats (requires `STATS_TOKEN`).

#### `GET /api/v1/stats/public`

Limited public stats (no auth required).

#### `GET /api/v1/storage`

Storage statistics including Redis memory usage.
