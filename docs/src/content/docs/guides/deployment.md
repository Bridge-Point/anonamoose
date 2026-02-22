---
title: Deployment
description: Deploy Anonamoose with Docker Compose for production use.
---

## Docker Compose (recommended)

The Docker Compose setup runs Anonamoose, Redis, and the stats dashboard as a single stack.

### Setup

1. Create a `.env` file in the project root:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
API_TOKEN=your-api-token
STATS_TOKEN=your-stats-token
```

2. Start the stack:

```bash
cd docker
docker-compose up -d
```

### Services

| Service | Internal Port | External Port | Description |
|---------|--------------|---------------|-------------|
| `anonamoose` | 3000 | 3100 | Proxy server |
| `anonamoose` | 3001 | 3101 | Management API |
| `redis` | 6379 | — | Session storage (not exposed) |
| `ui` | 3002 | 3102 | Stats dashboard |

### Health checks

Both Anonamoose and Redis have health checks configured:

- **Anonamoose**: `GET /health` every 30s
- **Redis**: `redis-cli ping` every 10s

The Anonamoose service waits for Redis to be healthy before starting.

### Volumes

| Volume | Purpose |
|--------|---------|
| `dictionary-data` | Persisted dictionary data |
| `redis-data` | Redis persistence |

### Stopping

```bash
cd docker
docker-compose down
```

To remove volumes (deletes all data):

```bash
docker-compose down -v
```

## Single container

For simpler deployments without Redis or the dashboard:

```bash
docker build -t anonamoose -f docker/Dockerfile .
docker run -p 3000:3000 -p 3001:3001 \
  -e STATS_TOKEN=your-token \
  -e OPENAI_API_KEY=sk-... \
  anonamoose
```

Sessions will use in-memory storage and be lost on container restart.

## Reverse proxy

When running behind a reverse proxy (e.g. nginx, Caddy), forward all traffic to port 3000 for the proxy and port 3001 for the management API.

Example nginx configuration:

```nginx
upstream anonamoose_proxy {
    server 127.0.0.1:3100;
}

upstream anonamoose_api {
    server 127.0.0.1:3101;
}

server {
    listen 443 ssl;
    server_name llm-proxy.example.com;

    location / {
        proxy_pass http://anonamoose_proxy;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

server {
    listen 443 ssl;
    server_name llm-api.example.com;

    location / {
        proxy_pass http://anonamoose_api;
        proxy_set_header Host $host;
    }
}
```
