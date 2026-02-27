---
title: Anonamoose vs Presidio
description: Why Anonamoose exists and how it compares to Microsoft Presidio.
---

[Microsoft Presidio](https://github.com/microsoft/presidio) is the most well-known open-source PII detection library. Anonamoose was built to address specific gaps in Presidio's approach.

## The core problem

Presidio relies on probabilistic detection (NER models, pattern recognizers). This means it can **miss** PII — and when it does, there's no fallback. If a customer name doesn't match any recognizer pattern, it goes straight through to the LLM.

Anonamoose's dictionary layer solves this: **if you add a term, it will always be redacted**. No probability, no confidence threshold, no misses.

## Comparison

| Aspect | Microsoft Presidio | Anonamoose |
|--------|-------------------|------------|
| **Guaranteed redaction** | No — all detection is probabilistic | Yes — dictionary layer is 100% recall |
| **Tokenization** | Simple placeholder strings | Unicode PUA tokens (LLM-optimized) |
| **Streaming** | Limited | Full SSE streaming support |
| **Rehydration** | Not built-in | Built-in session-based rehydration |
| **LLM Proxy** | Not included | Drop-in OpenAI & Anthropic proxy |
| **AU/NZ/UK patterns** | Limited coverage | Comprehensive with validators (TFN, Medicare, IRD, NINO) |
| **Stats dashboard** | No | Built-in (Next.js + shadcn) |
| **Language** | Python | TypeScript/Node.js |
| **NER engine** | spaCy `en_core_web_lg` | Transformer (`bert-base-NER`, F1: 91.3) |

## When to use Anonamoose

- You need **guaranteed** redaction of specific terms (customer names, project names)
- You're building with **Node.js/TypeScript** and want a native solution
- You need a **drop-in proxy** for OpenAI or Anthropic
- You need **rehydration** — restoring original values after LLM processing
- You're working with **AU/NZ/UK** PII formats
- You want **streaming** support for chat completions

## NER comparison

Anonamoose now uses a transformer-based NER model (`Xenova/bert-base-NER`, quantized ONNX) running natively in Node.js via `@huggingface/transformers`. This achieves an F1 score of 91.3 on CoNLL-2003, which is comparable to Presidio's default spaCy `en_core_web_lg` model — without requiring any Python dependency. The model loads lazily on first NER request and provides real confidence scores for each detected entity.

## When to use Presidio

- You're working in a **Python** ecosystem
- You need support for **many languages** via spaCy models
- You need **custom NER models** trained on domain-specific data
- You only need detection (no proxy, no rehydration)
- You need to meet specific **compliance frameworks** that reference Presidio

## Using both together

Anonamoose and Presidio are not mutually exclusive. You could use Presidio for initial detection in a Python pipeline and Anonamoose as the proxy layer with dictionary-based guarantees on top.
