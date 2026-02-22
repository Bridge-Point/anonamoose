---
title: Stats Dashboard
description: Monitor redaction activity with the built-in dashboard.
---

Anonamoose includes a stats dashboard built with Next.js and shadcn UI components. It provides real-time visibility into redaction activity.

## Accessing the dashboard

When running with Docker Compose, the dashboard is available at **http://localhost:3102**.

The dashboard requires a `STATS_TOKEN` to be configured. Set this in your `.env` file:

```bash
STATS_TOKEN=your-secure-stats-token
```

## Stats API

### Protected stats

Full stats including hit counts by detection type:

```bash
curl http://localhost:3001/api/v1/stats \
  -H "Authorization: Bearer your-stats-token"
```

Response:

```json
{
  "requestsRedacted": 142,
  "requestsHydrated": 98,
  "piiDetected": 367,
  "dictionaryHits": 45,
  "regexHits": 289,
  "nerHits": 33,
  "activeSessions": 12,
  "redisConnected": true,
  "dictionarySize": 8,
  "storage": {
    "sessionCount": 12,
    "totalTokens": 367,
    "redisConnected": true,
    "memoryUsage": "1.24M"
  }
}
```

### Public stats

A limited stats endpoint is available without authentication:

```bash
curl http://localhost:3001/api/v1/stats/public
```

Returns only:

```json
{
  "activeSessions": 12,
  "redisConnected": true,
  "dictionarySize": 8
}
```

### Storage stats

```bash
curl http://localhost:3001/api/v1/storage \
  -H "Authorization: Bearer your-api-token"
```

Returns session count, total tokens, Redis connection status, and memory usage.
