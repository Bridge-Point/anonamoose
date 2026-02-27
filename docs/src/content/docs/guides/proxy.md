---
title: Proxy Usage
description: Use Anonamoose as a drop-in proxy for OpenAI and Anthropic APIs.
---

Anonamoose acts as a transparent proxy between your application and LLM APIs. Point your SDK at Anonamoose instead of the upstream API, and PII is automatically redacted before it leaves your network.

## Path formats

Anonamoose supports endpoints both with and without the `/v1` prefix for maximum compatibility:

| With prefix | Without prefix |
|-------------|----------------|
| `/v1/chat/completions` | `/chat/completions` |
| `/v1/messages` | `/messages` |
| `/v1/models` | `/models` |
| `/v1/embeddings` | `/embeddings` |

This ensures compatibility with clients that may strip or omit the `/v1` prefix.

## OpenAI

### cURL

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-openai-key" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Summarize: John Smith called from 0412 345 678 about his account"}
    ]
  }'
```

### Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-openai-key",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Summarize: John Smith called from 0412 345 678"}]
)
```

### Node.js SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-openai-key',
  baseURL: 'http://localhost:3000/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Summarize: John Smith called from 0412 345 678' }],
});
```

## Anthropic

### cURL

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-ant-your-key" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Summarize: Jane Doe (jane@acme.com) requested a refund"}
    ]
  }'
```

## Request headers

Control redaction and rehydration behavior per-request with these headers:

| Header | Values | Default | Description |
|--------|--------|---------|-------------|
| `x-anonamoose-session` | UUID string | auto-generated | Session ID for token storage and rehydration |
| `x-anonamoose-redact` | `true` / `false` | `true` | Enable/disable redaction for this request |
| `x-anonamoose-hydrate` | `true` / `false` | `true` | Enable/disable rehydration of the response |

### Disabling redaction

Pass requests through without redaction (useful for non-sensitive queries):

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "x-anonamoose-redact: false" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "What is 2+2?"}]}'
```

### Session pinning

Use a consistent session ID across multiple requests to accumulate tokens for rehydration:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "x-anonamoose-session: my-conversation-123" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{"model": "gpt-4", "messages": [...]}'
```

## Streaming

Both OpenAI and Anthropic streaming are fully supported. Set `"stream": true` in your request body and Anonamoose will stream the response back, rehydrating tokens in each chunk.
