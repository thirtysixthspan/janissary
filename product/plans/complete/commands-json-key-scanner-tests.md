# Pin the hand-written commands.json key scanner with direct tests

**Complexity: 2/10** — only a colocated test file is added; the scanner is expected to be correct, and any case that fails gets a minimal fix in the same unit.

`orderedKeys` in `src/native-commands/decode.ts` is a character-level JSON scanner that decides which duplicate key wins and which entries are malformed. Its only test (in `manager.test.ts`) passes a pre-parsed object plus a trivial text, so escape, depth, and comma handling has no colocated coverage.

## Goal

Direct tests of `decodeCommandSettings(JSON.parse(text), text)` for real file texts, so a key or string value containing escapes, brackets, braces, or commas can never silently desynchronise the scanner.

## Approach

Create `src/native-commands/decode.test.ts` with a helper that parses the text and decodes it. Existing `manager.test.ts` cases stay untouched.

## Implementation steps

1. Add `src/native-commands/decode.test.ts` covering the cases below.
2. If a case fails, fix `src/native-commands/decode.ts` minimally.

## Tests

- Keys with escaped quotes and backslashes.
- `{`, `}`, `[`, `]`, `,` inside key strings and inside string values.
- A malformed string value at depth one is flagged malformed and defaults to enabled.
- Nested objects and arrays inside entries do not disturb key tracking.
- Exact duplicate keys: the last value wins.
- Keys colliding after normalization, in both orders: the textual-last entry wins.
- An empty (or whitespace-only) key is malformed and produces no entry.
- Non-object top-level values return `undefined`.

## Out of scope

Changing normalization or malformed-entry semantics; the other backlog entries.
