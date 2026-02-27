---
title: Deployment
description: Deploy Anonamoose with Docker Compose for production use.
---

## Docker Compose (recommended)

A single container runs the proxy, management API, and admin panel.

### Setup

1. Create a `.env` file in the project root:

```bash
API_TOKEN=your-api-token
```

2. Start the stack:

```bash
docker-compose up -d
```

The compose file is at the project root (`docker-compose.yaml`).

### Health check

- **Anonamoose**: `GET /health` every 5s

### Volumes

| Volume | Purpose |
|--------|---------|
| `db-data` | SQLite database persistence |

### Stopping

```bash
docker-compose down
```

To remove volumes (deletes all data):

```bash
docker-compose down -v
```

## Coolify

Anonamoose supports deployment on [Coolify](https://coolify.io/) as a Docker Compose stack. Coolify expects `docker-compose.yaml` (not `.yml`). The compose file uses Coolify magic variables for automatic FQDN routing:

- `SERVICE_FQDN_ANONAMOOSE_3000` — public URL for the proxy and admin panel

Set `API_TOKEN` in the Coolify service environment variables.

## Single container

```bash
docker build -t anonamoose -f docker/Dockerfile .
docker run -p 3000:3000 \
  -e API_TOKEN=your-token \
  -v anonamoose-data:/app/data \
  anonamoose
```

Mount a volume for `/app/data` to persist the SQLite database across container restarts.

## Reverse proxy

When running behind a reverse proxy (e.g. nginx, Caddy, Coolify), Anonamoose has `trust proxy` enabled to correctly handle `X-Forwarded-For` headers.

Example nginx configuration:

```nginx
upstream anonamoose {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl;
    server_name llm-proxy.example.com;

    location / {
        proxy_pass http://anonamoose;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
