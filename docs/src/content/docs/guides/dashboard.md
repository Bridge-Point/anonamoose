---
title: Dashboard & Admin Panel
description: Monitor redaction activity and manage your Anonamoose instance.
---

Anonamoose includes a Next.js dashboard and admin panel for monitoring and management.

## Dashboard

The public dashboard shows real-time stats without authentication:

- Requests redacted / hydrated
- PII detected (total and by layer)
- Active sessions
- Dictionary size
- System status (API, database, NER)

When running with Docker Compose, the dashboard is available at port **3002**.

## Admin panel

The admin panel is at `/admin` and requires `API_TOKEN` authentication. It provides five tabs:

### Request Logs

Live request log showing every request through the proxy (auto-refreshes every 5 seconds):

- Method, path, status code, duration, client IP
- Admin/management API calls are excluded from the log
- Clear all logs with one click

### Sessions & Cache

Browse and manage active rehydration sessions:

- Search sessions by ID or token placeholder
- View token mappings for each session (placeholder, type, category)
- Delete individual sessions
- Flush all sessions

### Redaction Inspector

Test and verify redaction in real time:

- Enter text and run it through the pipeline
- View the redacted output with token placeholders
- See each detection: original text, category, layer, confidence score, position
- **Recent Redactions** (last 15 minutes) — browse redactions from live proxy traffic with expandable details showing input, output, and detections

### Dictionary

Manage guaranteed redaction terms:

- Add new terms with one click
- Search and browse existing terms
- Remove individual terms
- Clear all terms
- Pagination for large dictionaries

### Settings

Configure the redaction pipeline at runtime:

- Toggle layers on/off (Dictionary, Local AI, Regex, Name Detection)
- Change the NER model (HuggingFace model ID)
- Adjust NER confidence threshold
- Configure tokenization (placeholders, prefix, suffix)

Settings persist across restarts in the SQLite database.

## Authentication

Set `API_TOKEN` in your environment to protect the admin panel:

```bash
API_TOKEN=your-secure-token
```

The admin panel prompts for this token on first visit. The token is stored in the browser's session storage and cleared when the tab closes.

## Stats API

### Full stats

Requires `API_TOKEN` or `STATS_TOKEN`:

```bash
curl http://localhost:3000/api/v1/stats \
  -H "Authorization: Bearer your-token"
```

Response:

```json
{
  "requestsRedacted": 142,
  "requestsHydrated": 98,
  "piiDetected": 367,
  "dictionaryHits": 45,
  "regexHits": 189,
  "namesHits": 23,
  "nerHits": 110,
  "activeSessions": 12,
  "storageConnected": true,
  "dictionarySize": 8
}
```

### Public stats

Available without authentication:

```bash
curl http://localhost:3000/api/v1/stats/public
```

Returns a limited subset: active sessions, storage status, dictionary size, and basic hit counts.
