---
title: Configuration
description: Configure Anonamoose via environment variables.
---

Anonamoose is configured entirely through environment variables. Set them in a `.env` file or pass them directly.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Proxy server port |
| `MGMT_PORT` | `3001` | Management API port |
| `OPENAI_API_KEY` | — | OpenAI API key for proxy passthrough |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for proxy passthrough |
| `REDIS_URL` | — | Redis connection URL (e.g. `redis://localhost:6379`). Falls back to in-memory storage if not set. |
| `API_TOKEN` | — | Bearer token for management API auth. If unset, management endpoints are unauthenticated. |
| `STATS_TOKEN` | — | Bearer token for the stats endpoint. Required to access protected stats. |

## Redaction pipeline defaults

The redaction pipeline is configured in code via `RedactionConfig`:

| Option | Default | Description |
|--------|---------|-------------|
| `enableDictionary` | `true` | Enable dictionary-based guaranteed redaction |
| `enableRegex` | `true` | Enable regex pattern detection |
| `enableNER` | `false` | Enable NER (compromise.js) detection. Disabled by default for performance. |
| `tokenizePlaceholders` | `true` | Use PUA token placeholders instead of descriptive labels |

## Storage

By default, sessions are stored **in-memory** and are lost on restart. For persistent storage, provide a `REDIS_URL`:

```bash
REDIS_URL=redis://localhost:6379
```

Sessions have a default TTL of 1 hour (3600 seconds). You can extend individual sessions via the API.

## Authentication

### Management API (`API_TOKEN`)

When `API_TOKEN` is set, all `/api/v1/*` endpoints require a Bearer token:

```bash
curl -H "Authorization: Bearer your-api-token" \
  http://localhost:3001/api/v1/dictionary
```

When `API_TOKEN` is not set, management endpoints are open (suitable for development).

### Stats (`STATS_TOKEN`)

The `STATS_TOKEN` protects the `/api/v1/stats` endpoint and the dashboard UI. It must be explicitly configured — stats are not accessible without it.
