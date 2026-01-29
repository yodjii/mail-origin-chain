# email-origin-chain

[![npm version](https://img.shields.io/npm/v/email-origin-chain.svg)](https://www.npmjs.com/package/email-origin-chain)
[![npm downloads](https://img.shields.io/npm/dm/email-origin-chain.svg)](https://www.npmjs.com/package/email-origin-chain)
[![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen)](tests/)
[![Fixtures](https://img.shields.io/badge/Fixtures-239%2F239%20Passed-blue)](docs/TEST_COVERAGE.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Uncover the full audit trail of your email threads.** Recursively deep-dives into forwards and replies to reconstruct the entire conversation history. Combines MIME traversal with multi-language text detection for a perfect message chain—giving you instant access to the original sender's details and the true source message.

## Architecture & Refactor

The library recently underwent a major refactor to a plugin-based architecture, improving compatibility and fix recursion bugs.

Detailed documentation can be found in the [docs/architecture/](docs/architecture/README.md) directory:
- [Phase 1: Cc: Fix](docs/architecture/phase1_cc_fix.md)
- [Phase 2: Plugin Architecture](docs/architecture/phase2_plugin_foundation.md)
- [Phase 3: Full Compatibility (100%)](docs/architecture/phase3_fallbacks.md)
- [Deep Forward Fix Walkthrough](docs/walkthrough_deep_forward_fix.md)
- [Confidence Scoring System](docs/confidence_scoring.md)
- [Detector Usage & Priorities](docs/detectors_usage.md)

**✅ Test Coverage:** The library has been validated against **239 fixtures** from the `email-forward-parser-recursive` library with a **100% success rate** (239/239). This includes validating message bodies and ensuring non-message snippets are correctly identified. See [Test Coverage Report](docs/TEST_COVERAGE.md) for details.

## Features

- **Hybrid Strategy**: Combines MIME recursion (`message/rfc822`) and inline text parsing
- **Reply & Forward Support**: Detects both traditional "Forwarded message" blocks and "On ... wrote:" reply headers in 15+ languages.
- **Robust Parsing**: Uses `mailparser` and `email-forward-parser` with custom detectors for Outlook Live, French headers, and more.
- **Type-Safe**: Full TypeScript support
- **Normalized Output**: Consistent result format with diagnostics

## Installation

```bash
npm install email-origin-chain
```

### CLI Utilities
You can test any email file directly using the included extraction tool:
```bash
npx tsx bin/extract.ts tests/fixtures/complex-forward.eml
```

```typescript
import { extractDeepestHybrid } from 'email-origin-chain';

// Process a full EML with hybrid strategy
const result = await extractDeepestHybrid(rawEmailString);

// Process ONLY the text/inline forwards (ignore MIME layer)
const textOnlyResult = await extractDeepestHybrid(rawText, { skipMimeLayer: true });

console.log(result.text); // The deepest original message
console.log(result.history); // Full conversation chain
```

## Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `skipMimeLayer` | `boolean` | `false` | If `true`, ignores MIME parsing (`rfc822`) and processes the input as raw text only. Ideal for inputs that are already stripped of headers. |
| `maxDepth` | `number` | `5` | Maximum number of recursion levels for MIME parsing. |
| `timeoutMs` | `number` | `5000` | Timeout for MIME processing to prevent blocking on huge files. |

## Response Format

The library returns a `ResultObject` with the following structure:

| Field | Type | Description |
| :--- | :--- | :--- |
| `from` | `object \| null` | `{ name?: string, address?: string }`. |
| `to` | `array` | List of primary recipients. |
| `cc` | `array` | List of CC recipients. |
| `subject` | `string \| null` | The original subject line of the deepest message. |
| `date_raw` | `string \| null` | The original date string found in the email headers. |
| `date_iso` | `string \| null` | ISO 8601 UTC representation (normalized via `any-date-parser`). |
| `text` | `string \| null` | Cleaned body content of the deepest message. |
| `attachments` | `array` | Metadata for MIME attachments found at the deepest level. |
| `history` | `array` | **Conversation Chaining**: Full audit trail of the discussion (see below). |
| `confidence_score` | `number` | Reliability score (0-100) based on signal analysis. |
| `confidence_description` | `string` | Human-readable explanation of the score. |
| `confidence_signals` | `object` | Key-value breakdown of triggered bonuses and penalties. |
| `confidence_reasons` | `array` | Detailed list of triggered scoring rules. |
| `diagnostics` | `object` | Metadata about the parsing process. |

### Diagnostics Detail

- **`method`**: Strategy used to find the deepest message.
    - `rfc822`: Found via recursive MIME attachments (highest reliability).
    - `inline`: Found via text pattern detection (forwarded blocks).
    - `fallback`: No forward found, returning current message info or best-effort extraction.
- **`depth`**: Number of forward levels traversed (0 for original email).
- **`parsedOk`**: `true` if at least a sender (`from`) and `subject` were successfully extracted.
- **`warnings`**: Array of non-fatal issues (e.g., date normalization failure).

### Conversation Chain Reconstruction (Full History)

Rather than just finding the "original" source, the library reconstructs the entire **Conversation Chain** (sometimes called *Email Threading* or *Message Chaining*). This allows you to audit every step of a transfer:

- **`history[0]`**: The **deepest** (oldest) message in the chain. Same as the root object.
- **`history[1...n-1]`**: Intermediate forwards/messages.
- **`history[n]`**: The **root** (most recent) message you actually received.

Each history entry contains its own `from`, `to`, `cc`, `subject`, `date_iso`, `text`, and **`flags`** (array of strings). The contact fields (`from`, `to`, `cc`) are structured as objects containing:
- **`name`**: The display name (e.g., "John Doe").
- **`address`**: The email address (e.g., "john@example.com").

#### Possible Flags:
- `level:deepest`: The original source of the thread.
- `level:root`: The entry representing the received email itself.
- `trust:high_mime`: Metadata from a real `.eml` attachment (100% reliable).
- `trust:medium_inline`: Metadata extracted from text patterns (best effort).
- `method:crisp_engine`: Detected via standard international patterns (Crisp).
- `method:outlook_fr`: Detected via standard rules (French, Outlook).
- `method:outlook_reverse_fr`: Detected via reversed rules (Envoyé before De).
- `method:outlook_empty_header`: Detected via permissive rules (No date/email).
- `method:new_outlook`: Detected via modern localized headers (handles bolding and `mailto:` tags).
- `method:reply`: Detected via international reply patterns (`On ... wrote:`).
- `method:crisp`: Detected via standard international patterns (Crisp/Fallback).
- `content:silent_forward`: The user forwarded the message without adding any text.
- `date:unparseable`: A date string was found but could not be normalized to ISO.

## Confidence Scoring System

To ensure high-quality extraction from text-based forwards, the library uses a **Signal-Based Confidence Score**. It analyzes metrics like email address density, sender count consistency, and quote levels to detect "Garbage" or incomplete chains.

### Scoring Logic:
- **Baseline**: 100% confidence for standard formatting (~2 emails per level).
- **Penalties**:
    - **Sender Mismatch**: More senders found than levels detected (-75%).
    - **Quote Mismatch**: Quote nesting deeper than detected levels (-75%).
    - **Partial Chain**: Only 1 email detected per level (-50%).
    - **Ghost Forward**: No emails found in text (-100%).
- **Bonuses**:
    - **Validated Density**: High email density corroborated by context headers (+75%).

Check the [Confidence Scoring Documentation](docs/confidence_scoring.md) for full details.

### Typical Output Example

```json
{
  "from": { "name": "Original Sender Name", "address": "original@source.com" },
  "subject": "Initial Topic",
  "text": "The very first message content.",
  "history": [
    {
      "depth": 2,
      "from": { "name": "Original Sender Name", "address": "original@source.com" },
      "text": "The very first message content.",
      "flags": ["method:outlook_fr", "trust:medium_inline", "level:deepest"]
    },
    {
      "depth": 1,
      "from": { "name": "Intermediate Person", "address": "inter@company.com" },
      "text": "",
      "flags": ["method:crisp", "trust:medium_inline", "content:silent_forward"]
    },
    {
      "depth": 0,
      "from": { "name": "Me", "address": "me@provider.com" },
      "text": "Check this thread below!",
      "flags": ["trust:high_mime", "level:root"]
    }
  ],
  "diagnostics": {
    "method": "inline",
    "depth": 2,
    "parsedOk": true,
    "warnings": []
  },
  "confidence_score": 100,
  "confidence_description": "High Confidence: Standard Density: Ratio 2.00 is optimal (~2 emails per level)",
  "confidence_signals": {},
  "confidence_reasons": [
    "Standard Density: Ratio 2.00 is optimal (~2 emails per level)"
  ]
}
```

## Examples

### 1. Simple Email (No Forward)
When no forward is detected, the library returns the metadata of the email itself.

```typescript
const email = `From: alice@example.com
Subject: Meeting Update
Date: Mon, 26 Jan 2026 15:00:00 +0100

Hey, the meeting is moved to 4 PM.`;

const result = await extractDeepestHybrid(email);
console.log(result.diagnostics.depth); // 0
console.log(result.from.address);      // "alice@example.com"
```

### 2. Double Inline Forward (Deep Extraction)
The library recursively follows "Forwarded message" blocks to find the original sender.

```typescript
const doubleForward = `
---------- Forwarded message ---------
From: Flo R. <florian.regalo@gmail.com>
Date: Mon, 26 Jan 2026 at 15:01
Subject: Fwd: original topic

---------- Forwarded message ---------
From: Original Sender <original@source.com>
Date: Mon, 26 Jan 2026 at 10:00
Subject: original topic

This is the very first message content.`;

const result = await extractDeepestHybrid(doubleForward);
console.log(result.diagnostics.depth);  // 2
console.log(result.from.address);       // "original@source.com"
console.log(result.text);               // "This is the very first message content."
```

### 3. Extreme Conversation Chain (5 Levels)
For complex corporate threads where a message is forwarded multiple times across different regional offices (e.g., mixing English and French headers).

```typescript
const extremeChain = `From: boss@corp.com
Date: Tue, 27 Jan 2026 02:35:18 +0100
Subject: FW: Final Review

Check the bottom of this long thread.

---------- Forwarded message ---------
From: "Intermediate Manager" <inter-2@corp.com>
Date: mardi 27 janvier 2026 à 00:30
Subject: Tr: Final Review

But it is quite normal!

De : "Employee" <real.end@gmail.com>
Envoyé : mardi 27 janvier 2026 à 00:30
À : "Recip" <inter-1@provider.com>
Objet : Fwd: Final Review

Great Yodjii, thank you

---------- Forwarded message ---------
From: <inter-1@provider.com>
Date: Tue, 27 Jan 2026 at 00:29
Subject: Fwd: original request

Ok noted, I am forwarding it back to you.

---------- Forwarded message ---------
From: <original@source.com>
Date: mardi 27 janvier 2026 à 00:28
Subject: original request

Hello, please forward this back to me.`;

const result = await extractDeepestHybrid(extremeChain);
console.log(result.diagnostics.depth); // 4 (5 messages total)
```

**JSON Output Example (Extreme Case):**

```json
{
  "from": { "address": "original@source.com" },
  "subject": "original request",
  "text": "Hello, please forward this back to me.",
  "history": [
    {
      "depth": 4,
      "from": { "address": "original@source.com" },
      "text": "Hello, please forward this back to me.",
      "flags": ["method:crisp", "trust:medium_inline", "level:deepest"]
    },
    {
      "depth": 3,
      "from": { "address": "inter-1@provider.com" },
      "text": "Ok noted, I am forwarding it back to you.",
      "flags": ["method:crisp", "trust:medium_inline"]
    },
    {
      "depth": 2,
      "from": { "name": "Employee", "address": "real.end@gmail.com" },
      "text": "Great Yodjii, thank you",
      "flags": ["method:outlook_empty_header", "trust:medium_inline"]
    },
    {
      "depth": 1,
      "from": { "name": "Intermediate Manager", "address": "inter-2@corp.com" },
      "text": "But it is quite normal!",
      "flags": ["method:crisp", "trust:medium_inline"]
    },
    {
      "depth": 0,
      "from": { "address": "boss@corp.com" },
      "text": "Check the bottom of this long thread.",
      "flags": ["trust:high_mime", "level:root"]
    }
  ],
  "diagnostics": {
    "method": "inline",
    "depth": 4,
    "parsedOk": true,
    "warnings": []
  },
  "confidence_score": 100,
  "confidence_description": "High Confidence: Standard Density: Ratio 2.00 is optimal (~2 emails per level)",
  "confidence_signals": {},
  "confidence_reasons": [
    "Standard Density: Ratio 2.00 is optimal (~2 emails per level)"
  ]
}
```

### 4. International Support (e.g., French)
The library automatically handles international headers like "De:", "Objet:", "Message transféré".

```typescript
const frenchEmail = `
---------- Message transféré ---------
De : Expert Auto <expert@assurance.fr>
Date : lun. 10 févr. 2025 à 11:39
Objet : Dossier #12345

Hello, here is your expertise report.`;

const result = await extractDeepestHybrid(frenchEmail);
console.log(result.from.name);       // "Expert Auto"
console.log(result.date_iso);        // "2025-02-10T10:39:00.000Z"
```

## Extensions & Plugins (Custom Detectors)

The library allows you to inject **custom forward detectors** to handle specific corporate headers, regional formats, or proprietary email barriers that are not covered by the default detectors.

This system is built on **Dependency Injection**, meaning your custom logic lives in your application code, not deeper in `node_modules`.

### How to create a Plugin
Implement the `ForwardDetector` interface:

```typescript
import { extractDeepestHybrid, ForwardDetector, DetectionResult } from 'email-deepest-forward';

class MyCustomDetector implements ForwardDetector {
    // Unique name for your detector (will appear in 'diagnostics.method')
    name = 'my-custom-detector';
    
    // Priority: Lower number = Higher priority.
    // -100 = Override Everything (Expert Plugins)
    // -40 to -20 = Specific Build-in Detectors (Outlook, FR, etc.)
    // 100 = Crisp (Default International Engine)
    // 150 = Reply (Fallback)
    priority = -100;

    detect(text: string): DetectionResult {
        // Example: Detects '--- START FORWARD ---'
        const marker = '--- START FORWARD ---';
        const idx = text.indexOf(marker);

        if (idx !== -1) {
            // Extracted body (text AFTER the marker)
            const body = text.substring(idx + marker.length).trim();
            
            // Text BEFORE the marker (the message from the forwarder)
            const message = text.substring(0, idx).trim();

            return {
                found: true,
                detector: this.name,
                confidence: 'high',
                message: message, // Important for history reconstruction
                email: {
                    from: { name: 'Detected Sender', address: 'sender@example.com' },
                    subject: 'Extracted Subject',
                    date: new Date().toISOString(),
                    body: body
                }
            };
        }
        
        return { found: false, confidence: 'low' };
    }
}
```

### How to use it
Pass your detector instance in the `options.customDetectors` array:

```typescript
const result = await extractDeepestHybrid(emailContent, {
    customDetectors: [ new MyCustomDetector() ]
});

console.log(result.diagnostics.method); // "method:my-custom-detector"
```

---


### Malformed Inputs
If you pass a string that isn't an email (e.g., a simple welcome message), the library returns the text but sets `parsedOk` to `false`.

```typescript
const result = await extractDeepestHybrid("Welcome to our platform!");

console.log(result.from);               // null
console.log(result.diagnostics.parsedOk); // false
console.log(result.text);               // "Welcome to our platform!"
```

### Missing or Unparseable Dates
If a date cannot be normalized to ISO format, `date_iso` will be `null` and a warning will be added. You can still access the original string via `date_raw`.

```typescript
const result = await extractDeepestHybrid(emailWithBadDate);

if (!result.date_iso) {
  console.warn(result.diagnostics.warnings[0]); // "Could not normalize date: ..."
  console.log("Raw date was:", result.date_raw);
}
```

### Non-String Input
The library strictly requires a string input and will throw an Error otherwise.

```typescript
try {
  await extractDeepestHybrid(null as any);
} catch (e) {
  console.error(e.message); // "Input must be a string"
}
```

## The Expert Cleaner Utility

All built-in detectors use the `Cleaner` utility to ensure consistent text normalization across recursion levels.

### Key Features:
- **Normalization**: Unifies line breaks (`\r\n` -> `\n`), removes BOM, handles `&nbsp;`.
- **Memoization**: Cache layer to prevent re-processing the same text multiple times.
- **Quote Stripping**: Expertly removes `>` prefixes while preserving body structure.
- **Boundary Detection**: Uses the "Double Newline" rule found in professional parsers.

```typescript
import { Cleaner } from 'email-origin-chain/utils/cleaner';

const normalized = Cleaner.normalize(rawText);
const bodyOnly = Cleaner.extractBody(lines, lastHeaderIndex);
const quoteFree = Cleaner.stripQuotes(bodyOnly);
```

## Strategy

1. **MIME Layer**: Recursively descends through `message/rfc822` attachments using `mailparser`.
2. **Inline Layer**: Iteratively scans the body for forwarded blocks using `email-forward-parser` patterns (supports multi-language).
3. **Date Normalization**: Uses `any-date-parser` and `luxon` for resilient international date parsing.
4. **Fallback**: Manual regex extraction if no structured headers are found.

## License

MIT - See [LICENSE](LICENSE) for details.
