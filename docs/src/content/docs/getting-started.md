---
title: Getting Started
description: Install and run Anonamoose in under five minutes.
---

Get Anonamoose running locally and make your first redacted request.

## Prerequisites

- Node.js 20+
- npm or yarn
- (Optional) Docker & Docker Compose

## Install

```bash
git clone https://github.com/Bridge-Point/anonamoose.git
cd anonamoose
npm install
```

## Configure

Create a `.env` file in the project root:

```bash
# Protects the management API and admin panel
API_TOKEN=your-api-token

# Optional — provide if proxying to LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

The proxy starts on port **3000** and the management API on port **3001** by default.

## Try it out

### Direct redaction

```bash
curl -X POST http://localhost:3000/api/v1/redact \
  -H "Content-Type: application/json" \
  -d '{"text": "Call John Smith at john@example.com or 0412 345 678"}'
```

The response returns the redacted text, a session ID for rehydration, and a list of detections.

### Proxy to OpenAI

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-openai-key" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Summarize this: John Smith (john@acme.com) called about order #12345"}]
  }'
```

PII is redacted before reaching OpenAI and rehydrated in the response automatically.

## Next steps

- [Installation](/guides/installation/) — detailed install options including Docker
- [Configuration](/guides/configuration/) — all environment variables and options
- [Dictionary](/guides/dictionary/) — add guaranteed redaction terms
- [How It Works](/concepts/how-it-works/) — understand the architecture
