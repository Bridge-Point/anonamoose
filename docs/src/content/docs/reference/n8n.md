---
title: n8n Integration
description: Use the Anonamoose custom node in n8n workflows.
---

Anonamoose provides a custom n8n node for integrating PII redaction into automation workflows.

## Installation

```bash
# In the Anonamoose project
cd src/n8n
npm link

# In your n8n installation directory
npm link anonamoose
```

Restart n8n after linking. The **Anonamoose** node will appear in the node palette.

## Credentials

Configure the **Anonamoose API** credential in n8n with:

| Field | Description |
|-------|-------------|
| Base URL | URL of your Anonamoose instance (e.g. `http://localhost:3000`) |
| API Token | Your `API_TOKEN` value |

## Operations

The Anonamoose node supports the following operations:

### Redact Text

Redacts PII from input text using the three-layer pipeline.

**Inputs:**
- `text` — The text to redact

**Outputs:**
- `redactedText` — Text with PII replaced by tokens
- `sessionId` — Session ID for rehydration
- `detections` — Array of detected PII items

### Hydrate Text

Restores redacted text to its original form using a session ID.

**Inputs:**
- `text` — Redacted text containing tokens
- `sessionId` — Session ID from the redaction step

**Outputs:**
- `text` — Original text with PII restored

### Add Dictionary Entry

Adds a guaranteed redaction term to the dictionary.

**Inputs:**
- `term` — The text to add
- `caseSensitive` — Whether to match case exactly
- `wholeWord` — Whether to match whole words only

### List Dictionary

Returns all dictionary entries.

### Proxy Request

Forwards an LLM request through the Anonamoose proxy with automatic redaction and rehydration.

**Inputs:**
- `provider` — `openai` or `anthropic`
- `model` — Model name
- `messages` — Chat messages array

### Get Stats

Returns redaction statistics from the Anonamoose instance.

## Example workflow

A typical n8n workflow using Anonamoose:

1. **Trigger** (Webhook, Schedule, etc.)
2. **Anonamoose: Redact Text** — Redact PII from incoming data
3. **HTTP Request / AI node** — Process with LLM
4. **Anonamoose: Hydrate Text** — Restore original values
5. **Output** (Email, Database, etc.)
