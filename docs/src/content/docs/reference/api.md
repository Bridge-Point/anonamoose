---
title: API Reference
description: Complete API endpoint reference for Anonamoose.
---

All endpoints are served on the proxy port (default `3000`). Management endpoints are under `/api/v1/`.

## Proxy endpoints

### `POST /v1/chat/completions`

Also available at `/chat/completions` (without `/v1` prefix).

OpenAI-compatible chat completions proxy. Redacts PII from messages before forwarding to OpenAI, rehydrates the response.

**Headers:**
- `Authorization: Bearer <openai-api-key>` — required
- `x-anonamoose-session: <session-id>` — optional, auto-generated if omitted
- `x-anonamoose-redact: true|false` — optional, default `true`
- `x-anonamoose-hydrate: true|false` — optional, default `true`

**Body:** Standard OpenAI chat completions request body. Supports `"stream": true`.

---

### `POST /v1/messages`

Also available at `/messages` (without `/v1` prefix).

Anthropic-compatible messages proxy. Redacts PII from messages and system prompt before forwarding to Anthropic.

**Headers:**
- `Authorization: Bearer <anthropic-api-key>` — required
- `x-anonamoose-session: <session-id>` — optional
- `x-anonamoose-redact: true|false` — optional, default `true`
- `x-anonamoose-hydrate: true|false` — optional, default `true`

**Body:** Standard Anthropic messages request body. Supports `"stream": true`.

---

### `ALL /v1/*` (OpenAI passthrough)

All other `/v1/*` paths (e.g. `/v1/models`, `/v1/embeddings`) are passed through to the OpenAI API. Also available without the `/v1` prefix (`/models`, `/embeddings`).

---

### `POST /api/v1/redact`

Direct redaction without proxying to an LLM.

**Body:**
```json
{
  "text": "string to redact",
  "locale": "AU"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | The text to redact (max 100,000 chars) |
| `locale` | string \| null | No | Override the global locale for this request. One of `AU`, `NZ`, `UK`, `US`, or `null` for all regions. If omitted, uses the global setting. |

**Response:**
```json
{
  "redactedText": "Call \ue000a1b2c3d4\ue001 at \ue000e5f6g7h8\ue001",
  "sessionId": "uuid",
  "detections": [
    {
      "type": "regex",
      "category": "EMAIL",
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

All management endpoints require `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is configured. The `STATS_TOKEN` is also accepted for stats-related endpoints.

### Dictionary

#### `GET /api/v1/dictionary`

List dictionary entries. Supports pagination and search.

**Query params:**
- `page` — Page number (default 1)
- `limit` — Entries per page (default 50)
- `q` — Search query

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
  ],
  "total": 42,
  "filtered": 42,
  "page": 1,
  "pages": 1
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

#### `POST /api/v1/dictionary/flush`

Remove all dictionary entries.

**Response:**
```json
{ "success": true, "cleared": 42 }
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

Full stats (requires `API_TOKEN` or `STATS_TOKEN`).

#### `GET /api/v1/stats/public`

Limited public stats (no auth required).

#### `GET /api/v1/storage`

Storage statistics including database size.

### Logs

#### `GET /api/v1/logs`

Recent request log (excludes management API calls).

**Query params:**
- `limit` — Max entries (default 100, max 500)
- `method` — Filter by HTTP method
- `path` — Filter by path (substring match)
- `status` — Filter by status code

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2026-02-22T00:00:00.000Z",
      "method": "POST",
      "path": "/v1/chat/completions",
      "status": 200,
      "ip": "127.0.0.1",
      "duration": 1234
    }
  ],
  "total": 42
}
```

#### `DELETE /api/v1/logs`

Clear the request log.

### Redactions

#### `GET /api/v1/redactions`

Recent redaction events (last 15 minutes). Each entry includes input preview, redacted preview, detections, and source (api/openai/anthropic).

#### `DELETE /api/v1/redactions`

Clear the redaction log.

### Settings

#### `GET /api/v1/settings`

Get all current settings.

**Response:**
```json
{
  "settings": {
    "enableDictionary": true,
    "enableRegex": true,
    "enableNames": true,
    "enableNER": true,
    "nerModel": "Xenova/bert-base-NER",
    "nerMinConfidence": 0.6,
    "locale": null,
    "tokenizePlaceholders": true,
    "placeholderPrefix": "\ue000",
    "placeholderSuffix": "\ue001"
  }
}
```

#### `PUT /api/v1/settings`

Update one or more settings. Only provided keys are changed.

**Body:**
```json
{
  "settings": {
    "nerModel": "Xenova/distilbert-NER",
    "nerMinConfidence": 0.8
  }
}
```

**Response:**
```json
{ "success": true, "settings": { "...all current settings..." } }
```

#### `GET /api/v1/settings/:key`

Get a single setting by key.

**Response:**
```json
{ "key": "nerModel", "value": "Xenova/bert-base-NER" }
```
