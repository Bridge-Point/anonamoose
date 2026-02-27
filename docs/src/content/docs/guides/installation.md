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
docker build -t anonamoose -f docker/Dockerfile .
docker run -p 3000:3000 -p 3001:3001 \
  -e API_TOKEN=your-token \
  -v anonamoose-data:/app/data \
  anonamoose
```

Mount `/app/data` to persist the SQLite database across container restarts.

### Docker Compose (recommended)

Docker Compose brings up Anonamoose and the admin panel together:

```bash
docker-compose up -d
```

This starts a single container with the proxy, management API, and admin panel on port 3000.

Create a `.env` file in the project root before running:

```bash
API_TOKEN=your-api-token
```

### Verifying the installation

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```
