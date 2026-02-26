---
title: Sessions & Rehydration
description: Manage sessions and restore redacted text to its original form.
---

Every redaction in Anonamoose creates a **session** — a mapping of tokenized placeholders back to their original values. Sessions enable rehydration: restoring redacted text after the LLM has processed it.

## How sessions work

1. Text is sent to Anonamoose for redaction
2. PII is detected and replaced with tokenized placeholders
3. The token-to-original mapping is stored in a session (keyed by session ID)
4. When the LLM response comes back, placeholders are replaced with the originals

## Session storage

Sessions are stored in **SQLite** and persist across restarts. The database path is configured via `ANONAMOOSE_DB_PATH` (default `./data/anonamoose.db`).

Sessions have a default TTL of **1 hour** (3600 seconds). Expired sessions are automatically cleaned up.

## Session API

### List all sessions

```bash
curl http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer your-api-token"
```

### Get a session

```bash
curl http://localhost:3001/api/v1/sessions/SESSION_ID \
  -H "Authorization: Bearer your-api-token"
```

Returns the session data including all token mappings:

```json
{
  "sessionId": "abc-123",
  "tokens": [
    {
      "original": "John Smith",
      "tokenized": "\ue000a1b2c3d4\ue001",
      "type": "dictionary",
      "category": "CUSTOM_DICTIONARY"
    }
  ],
  "createdAt": "2026-02-22T00:00:00.000Z",
  "expiresAt": "2026-02-22T01:00:00.000Z"
}
```

### Hydrate text

Restore redacted text using the session's token mappings:

```bash
curl -X POST http://localhost:3001/api/v1/sessions/SESSION_ID/hydrate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"text": "The customer \ue000a1b2c3d4\ue001 requested help"}'
```

### Extend session TTL

```bash
curl -X POST http://localhost:3001/api/v1/sessions/SESSION_ID/extend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"ttl": 7200}'
```

### Add tokens manually

```bash
curl -X POST http://localhost:3001/api/v1/sessions/SESSION_ID/tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "tokens": {"placeholder1": "original_value"},
    "type": "dictionary",
    "category": "CUSTOM"
  }'
```

### Search sessions

Search across all sessions by original value, category, or metadata:

```bash
curl "http://localhost:3001/api/v1/sessions/search?q=john" \
  -H "Authorization: Bearer your-api-token"
```

### Delete a session

```bash
curl -X DELETE http://localhost:3001/api/v1/sessions/SESSION_ID \
  -H "Authorization: Bearer your-api-token"
```

### Delete all sessions

```bash
curl -X DELETE http://localhost:3001/api/v1/sessions \
  -H "Authorization: Bearer your-api-token"
```
