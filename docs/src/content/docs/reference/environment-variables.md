---
title: Environment Variables
description: All environment variables supported by Anonamoose.
---

## Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port for the proxy server (OpenAI/Anthropic passthrough, direct redaction, and management API) |
| `MGMT_PORT` | No | `3001` | Port for the management API (dictionary, sessions, stats, settings) |

## Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANONAMOOSE_DB_PATH` | No | `./data/anonamoose.db` | Path to the SQLite database file. Sessions and settings are stored here with automatic TTL expiry. The directory is created automatically if it doesn't exist. |

## Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_TOKEN` | No | — | Bearer token for management API endpoints (`/api/v1/*`) and the admin panel. When not set, management endpoints are unauthenticated. This is the primary authentication token. |
| `STATS_TOKEN` | No | — | Bearer token for stats-only access (`/api/v1/stats`, `/api/v1/storage`). Useful for giving the dashboard read-only stats access without sharing the full `API_TOKEN`. |

## Docker Compose

When using Docker Compose, these are set automatically by the compose file:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Node.js environment |

All other variables should be set in a `.env` file at the project root, which Docker Compose reads automatically.
