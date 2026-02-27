---
title: Dictionary Management
description: Add guaranteed redaction terms that are never missed.
---

The dictionary is the first layer of the redaction pipeline and provides **guaranteed** redaction. Any term added to the dictionary will always be redacted with 100% recall — no probabilistic detection involved.

## Use cases

- Customer names that must never reach an LLM
- Internal project codenames
- Employee names or identifiers
- Any term where a miss is unacceptable

## Adding terms

```bash
curl -X POST http://localhost:3001/api/v1/dictionary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{
    "entries": [
      { "term": "John Smith", "caseSensitive": false, "wholeWord": true },
      { "term": "Project Falcon", "caseSensitive": true, "wholeWord": false }
    ]
  }'
```

### Entry options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `term` | string | *required* | The text to redact |
| `id` | string | auto-generated | Unique identifier |
| `replacement` | string | — | Optional replacement text |
| `caseSensitive` | boolean | `false` | Match exact case only |
| `wholeWord` | boolean | `false` | Match whole words only (word boundary) |

## Listing terms

```bash
curl http://localhost:3001/api/v1/dictionary \
  -H "Authorization: Bearer your-api-token"
```

Returns:

```json
{
  "entries": [
    {
      "id": "abc-123",
      "term": "John Smith",
      "caseSensitive": false,
      "wholeWord": true,
      "enabled": true,
      "createdAt": "2026-02-22T00:00:00.000Z"
    }
  ]
}
```

## Removing terms

By term name (case-insensitive):

```bash
curl -X DELETE http://localhost:3001/api/v1/dictionary/by-terms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"terms": ["John Smith", "Project Falcon"]}'
```

By ID:

```bash
curl -X DELETE http://localhost:3001/api/v1/dictionary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-token" \
  -d '{"ids": ["abc-123"]}'
```

## How it works

Dictionary entries are sorted by term length (longest first) to ensure longer matches take priority. Each match is replaced with a tokenized placeholder using Unicode Private Use Area characters, preserving the position for rehydration.

With `wholeWord: true`, the term is wrapped in `\b` word boundaries so partial matches within larger words are ignored. With `caseSensitive: false` (the default), matching is case-insensitive.
