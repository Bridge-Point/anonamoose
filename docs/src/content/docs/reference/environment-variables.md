---
title: Environment Variables
description: All environment variables supported by Anonamoose.
---

## Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Port for the proxy server (OpenAI/Anthropic passthrough and direct redaction) |
| `MGMT_PORT` | No | `3001` | Port for the management API (dictionary, sessions, stats) |

## LLM API Keys

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | No | — | OpenAI API key. Only needed if using the `/v1/chat/completions` proxy endpoint. Clients can also pass their own key via the `Authorization` header. |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key. Only needed if using the `/v1/messages` proxy endpoint. Clients can also pass their own key via the `Authorization` header. |

## Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | — | Redis connection URL (e.g. `redis://localhost:6379`). When set, sessions are stored in Redis with automatic TTL expiry. When not set, sessions are stored in-memory and lost on restart. |

## Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_TOKEN` | No | — | Bearer token for management API endpoints (`/api/v1/*`). When not set, management endpoints are unauthenticated. |
| `STATS_TOKEN` | No* | — | Bearer token for the stats endpoint and dashboard. *Must be set to access `/api/v1/stats`. |

## Docker Compose

When using Docker Compose, these are set automatically by the compose file:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `REDIS_URL` | `redis://redis:6379` | Points to the Redis container |

All other variables should be set in a `.env` file at the project root, which Docker Compose reads automatically.
