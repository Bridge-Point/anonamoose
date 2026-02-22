---
title: Three-Layer Pipeline
description: How the dictionary, regex, and NER layers work together for comprehensive PII detection.
---

Anonamoose uses a three-layer detection pipeline. Each layer catches different types of PII, and they run in a specific order to maximize coverage while avoiding double-matches.

## Layer 1: Dictionary (guaranteed)

**Confidence: 1.0 (always)**

The dictionary layer provides **guaranteed redaction**. Any term you add to the dictionary will always be found and replaced — no probabilistic detection, no chance of a miss.

- Runs first, before any other detection
- Case-sensitive or case-insensitive matching
- Whole-word or substring matching
- Entries sorted by length (longest first) to prevent partial matches

**When to use:** Customer names, project codenames, employee identifiers — anything where a miss is unacceptable.

```json
{
  "term": "John Smith",
  "caseSensitive": false,
  "wholeWord": true
}
```

## Layer 2: Regex (deterministic)

**Confidence: 0.70–0.98**

The regex layer uses pattern matching to detect structured PII like phone numbers, email addresses, tax file numbers, and credit cards. Many patterns include validators (checksums, format checks) to reduce false positives.

- Runs second, on text already processed by the dictionary layer
- Patterns are organized by country (AU, NZ, UK, US, Universal)
- Validators prevent false positives (e.g. Luhn check for credit cards)
- Each pattern has a confidence score

**What it catches:**
- Email addresses, phone numbers (AU/NZ/UK/US formats)
- Government IDs (TFN, Medicare, IRD, NINO, SSN)
- Financial (credit cards, bank accounts, sort codes, IBAN)
- Location (postcodes, addresses)
- Dates of birth, IP addresses

See [PII Patterns](/reference/pii-patterns/) for the complete list.

## Layer 3: NER (probabilistic)

**Confidence: 0.50–0.70**

The NER (Named Entity Recognition) layer uses [compromise.js](https://github.com/spencermountain/compromise) to detect entities in context. It finds names, organizations, and places that don't match any dictionary entry or regex pattern.

- Runs last, on text already processed by dictionary and regex
- Detects: `Person`, `Organization`, `Place`
- Context-aware — understands natural language structure
- **Disabled by default** for performance (set `enableNER: true` to enable)
- Deduplicates against existing detections to avoid double-matching

**What it catches:**
- Person names not in the dictionary
- Company and organization names
- Geographic locations and place names

## Pipeline order matters

The layers run in sequence, and each receives the output of the previous layer:

```
Original text
    │
    ▼
[Dictionary] ── guaranteed terms replaced first
    │
    ▼
[Regex] ── structured patterns matched on remaining text
    │
    ▼
[NER] ── context-aware entities on remaining text
    │
    ▼
Fully redacted text
```

This ordering ensures:
1. Dictionary matches are never overridden by lower-confidence detections
2. Regex patterns don't match inside already-tokenized placeholders
3. NER only runs on text that survived both previous layers
4. No PII value is detected or replaced twice

## Configuration

```typescript
const config: RedactionConfig = {
  enableDictionary: true,   // Layer 1 — on by default
  enableRegex: true,        // Layer 2 — on by default
  enableNER: false,         // Layer 3 — off by default (performance)
  tokenizePlaceholders: true
};
```
