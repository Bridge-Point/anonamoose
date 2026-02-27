---
title: Configuration
description: Configure Anonamoose via environment variables and runtime settings.
---

Anonamoose is configured through environment variables (for server setup) and runtime settings (for redaction behavior).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Proxy server port |
| `MGMT_PORT` | `3001` | Management API port |
| `ANONAMOOSE_DB_PATH` | `./data/anonamoose.db` | SQLite database path. Sessions and settings are stored here. |
| `API_TOKEN` | — | Bearer token for management API and admin panel authentication. If unset, management endpoints are unauthenticated. |
| `STATS_TOKEN` | — | Bearer token for stats-only access. |

## Redaction pipeline settings

Pipeline settings are stored in the SQLite database and can be changed at runtime via the [Settings API](/reference/api/#settings) or the [Admin Panel](/guides/dashboard/#settings). Defaults are seeded on first boot:

| Setting | Default | Description |
|---------|---------|-------------|
| `enableDictionary` | `true` | Enable dictionary-based guaranteed redaction |
| `enableNER` | `true` | Enable transformer NER detection (Local AI) |
| `enableRegex` | `true` | Enable regex pattern detection |
| `enableNames` | `true` | Enable name-list detection |
| `nerModel` | `Xenova/bert-base-NER` | HuggingFace model ID for NER |
| `nerMinConfidence` | `0.6` | Minimum NER confidence threshold |
| `locale` | `null` | Regex pattern region filter (see [Locale](#locale) below) |
| `tokenizePlaceholders` | `true` | Use PUA token placeholders instead of descriptive labels |
| `placeholderPrefix` | `\uE000` | Unicode PUA prefix for tokens |
| `placeholderSuffix` | `\uE001` | Unicode PUA suffix for tokens |

Settings persist across restarts and can be modified without redeploying.

## Locale

The `locale` setting controls which regional regex patterns are applied. When set, only patterns tagged for that region (plus universal patterns) run. This reduces false positives from patterns that aren't relevant to your users.

| Value | Patterns applied |
|-------|-----------------|
| `null` (default) | All patterns — AU + NZ + UK + US + universal |
| `AU` | Australian patterns + universal |
| `NZ` | New Zealand patterns + universal |
| `UK` | United Kingdom patterns + universal |
| `US` | United States patterns + universal |

Universal patterns (email, credit card, IP address, URL, VIN, MAC address, IBAN, contextual MRN, contextual certificate/licence) always run regardless of locale.

Set globally via the Settings API or admin panel. Can also be overridden per-request on the direct redaction endpoint:

```bash
curl -X POST http://localhost:3000/api/v1/redact \
  -H "Content-Type: application/json" \
  -d '{"text": "Call 04 1234 5678", "locale": "AU"}'
```

See [PII Patterns](/reference/pii-patterns/) for the full list of patterns per region.

## Storage

Sessions are stored in **SQLite** and persist across restarts. The database is created automatically at the configured path (default `./data/anonamoose.db`).

Sessions have a default TTL of 1 hour (3600 seconds). You can extend individual sessions via the API.

## Authentication

### Management API & Admin Panel (`API_TOKEN`)

When `API_TOKEN` is set, all `/api/v1/*` endpoints (except public stats) and the admin panel require authentication:

```bash
curl -H "Authorization: Bearer your-api-token" \
  http://localhost:3000/api/v1/dictionary
```

When `API_TOKEN` is not set, management endpoints are open (suitable for development).

### Stats (`STATS_TOKEN`)

The `STATS_TOKEN` is an alternative token accepted specifically for the stats endpoint. This is useful when you want to give the dashboard access to stats without sharing the full management `API_TOKEN`.
