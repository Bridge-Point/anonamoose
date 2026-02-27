---
title: Four-Layer Pipeline
description: How the dictionary, NER, regex, and names layers work together for comprehensive PII detection.
---

Anonamoose uses a four-layer detection pipeline. Each layer catches different types of PII, and they run in a specific order to maximize coverage while avoiding double-matches.

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

## Layer 2: Local AI / NER (probabilistic)

**Confidence: 0.50–0.99**

The NER (Named Entity Recognition) layer uses transformer-based models (`bert-base-NER` by default, F1: 91.3) running natively in Node.js via `@huggingface/transformers`. It runs second so it can analyze the natural text structure before regex and name detection modify it.

- Context-aware — transformer understands natural language structure
- Detects: `PER` (person), `ORG` (organization), `LOC` (location), `MISC`
- Model is configurable at runtime via the Settings API (`nerModel` setting)
- Confidence threshold is configurable (`nerMinConfidence`, default 0.6)
- **No input length limit** — long texts are automatically split into overlapping chunks (1,000 chars with 200 char overlap) so BERT's 512-token context window is used optimally. Entities near chunk boundaries are caught via the overlap zone.
- Loads lazily on first request
- Deduplicates against existing detections

**What it catches:**
- Person names not in the dictionary
- Company and organization names
- Geographic locations and place names

## Layer 3: Regex (deterministic)

**Confidence: 0.70–0.98**

The regex layer uses pattern matching to detect structured PII like phone numbers, email addresses, tax file numbers, and credit cards. Many patterns include validators (checksums, format checks) to reduce false positives.

- Runs on text already processed by dictionary and NER
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

## Layer 4: Name Detection (deterministic)

**Confidence: 0.50–0.85**

The name detection layer uses a hybrid approach combining a database of known first names with English dictionary exclusion. It catches names that NER may have missed.

- Scans for capitalized words in the text
- Checks against a database of ~10,000 known first names
- Cross-references with ~275,000 English words to reduce false positives
- Three confidence levels:
  - **0.85** — Known name, not an English word (e.g. "Jessica")
  - **0.70** — Unknown word not in any dictionary (likely a foreign or unusual name)
  - **0.50** — In both name list and English dictionary (ambiguous, e.g. "Rose", "Mark")
- Sentence-start words get reduced confidence
- Only processes capitalized words (lowercase "mark" is ignored)

## Pipeline order

The layers run in sequence, and each receives the output of the previous layer:

```
Original text
    │
    ▼
[Dictionary] ── guaranteed terms replaced first
    │
    ▼
[Local AI] ── context-aware entities on natural text
    │
    ▼
[Regex] ── structured patterns on remaining text
    │
    ▼
[Names] ── name-list detection catches stragglers
    │
    ▼
Fully redacted text
```

This ordering ensures:
1. Dictionary matches are never overridden by lower-confidence detections
2. NER sees natural text for best accuracy before regex modifies it
3. Regex patterns don't match inside already-tokenized placeholders
4. Name detection provides a final safety net for missed names
5. No PII value is detected or replaced twice

## Configuration

Pipeline settings are stored in the database and configurable at runtime via the [Settings API](/reference/api/#settings) or the [Admin Panel](/guides/dashboard/):

| Setting | Default | Description |
|---------|---------|-------------|
| `enableDictionary` | `true` | Layer 1 — dictionary |
| `enableNER` | `true` | Layer 2 — transformer NER |
| `enableRegex` | `true` | Layer 3 — regex patterns |
| `enableNames` | `true` | Layer 4 — name detection |
| `nerModel` | `Xenova/bert-base-NER` | HuggingFace model ID |
| `nerMinConfidence` | `0.6` | Minimum confidence threshold |
| `tokenizePlaceholders` | `true` | Use Unicode PUA tokens |
