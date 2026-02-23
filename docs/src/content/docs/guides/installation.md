---
title: Installation
description: Install Anonamoose from source or with Docker.
---

## From source

### Requirements

- Node.js 20 or later
- npm 9+

### Steps

```bash
git clone https://github.com/Bridge-Point/anonamoose.git
cd anonamoose
npm install
npm run build
```

Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Docker

### Single container

Build and run the Docker image:

```bash
cd docker
docker build -t anonamoose -f Dockerfile ..
docker run -p 3000:3000 -p 3001:3001 \
  -e STATS_TOKEN=your-token \
  anonamoose
```

### Docker Compose (recommended)

Docker Compose brings up Anonamoose, Redis, and the stats dashboard together:

```bash
cd docker
docker-compose up -d
```

This starts three services:

| Service | Port | Description |
|---------|------|-------------|
| `anonamoose` | 3100 → 3000 | Proxy server |
| `anonamoose` | 3101 → 3001 | Management API |
| `redis` | — | Session storage (internal) |
| `ui` | 3102 → 3002 | Stats dashboard |

Create a `.env` file in the project root before running:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
API_TOKEN=your-api-token
STATS_TOKEN=your-stats-token
```

### Verifying the installation

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```
