# Allow multi-line `[SUMMARY]`/`[SUGGESTION]`/`[COMMAND]` monitor replies

**Complexity: 2/10** — a single regex fix in one pure function, plus tests. No architecture
change; `parseSuggestion` is the only place this parsing lives.

## Goal

A monitoring persona's reply is parsed for `[SUMMARY]: <text>`, `[SUGGESTION]: <text>`, and
`[COMMAND]: <text>` marker lines. Today only the first line of text after a marker is kept —
anything on subsequent lines (e.g. a summary that continues onto bullet points) is silently
dropped. A marker's text should be able to span multiple lines, running until the next
bracket-marker line or the end of the reply, e.g.:

```
[SUMMARY]: Two parallel feature implementations underway:
- **claude** (Opus): implementing git modified coloring for file navigator (mid-thought, has context ready)
- **claude-2** (Sonnet): just started executing `build-a-feature.md` for **acp-rate-limit-notification** — reading the task file now
```
should deliver the full three-line text (marker prefix stripped), not just the first line.

## Root cause

`parseSuggestion` (`src/monitor/parsing.ts:58-66`) extracts each marker with
`/^\[SUMMARY]:\s*(.+)$/m` (and the equivalent for `[SUGGESTION]`/`[COMMAND]`). With the `m` flag,
`$` matches the end of the *current line*, not the end of the whole reply, and `.` never matches
a newline — so `(.+)` can only ever capture up to the first line break after the marker.

## Approach

Replace the single-line captures with a shared helper that captures everything after a
`[MARKER]:` prefix up to (but not including) the next bracket-marker line, or the end of the
reply if there is none — so a marker's text may span multiple lines while still correctly
stopping before an adjacent marker (e.g. `[SUGGESTION]: ...` followed by its own
`[COMMAND]: ...` line must not swallow the command line into the suggestion text).

## Implementation steps

1. **`src/monitor/parsing.ts`** — replace the two single-line regex lookups in `parseSuggestion`
   with a shared helper:
   ```ts
   // Extract the text following a `[MARKER]:` line, up to (but not including) the next
   // bracket-marker line or the end of the reply — so a marker's own text may span multiple
   // lines (e.g. a summary that continues onto bullet points).
   function captureMarker(reply: string, marker: string): string | undefined {
     const re = new RegExp(`(?:^|\\n)\\[${marker}]:\\s*([\\s\\S]*?)(?=\\n\\[[A-Z]+]:|$)`);
     return re.exec(reply)?.[1]?.trim();
   }

   export function parseSuggestion(reply: string): { text: string; command?: string } | null {
     const suggestion = captureMarker(reply, 'SUGGESTION');
     if (suggestion) {
       const command = captureMarker(reply, 'COMMAND');
       return command ? { text: suggestion, command } : { text: suggestion };
     }
     const summary = captureMarker(reply, 'SUMMARY');
     return summary ? { text: summary } : null;
   }
   ```
   No `m`/`s` flags: `(?:^|\n)` provides the "start of a line" anchor for the opening marker, and
   the un-flagged `$` in the lookahead means "true end of the reply" rather than "end of the
   current line" — which is exactly what makes the capture span multiple lines while still
   stopping at the next marker.

## Tests

- **`src/monitor/parsing.test.ts`** — add cases to the existing `describe('parseSuggestion', ...)`
  block:
  - A `[SUMMARY]:` reply whose text continues onto following bullet lines returns the full
    multi-line text (the exact example from the issue).
  - A `[SUGGESTION]:` reply with multi-line text followed by its own `[COMMAND]:` line returns
    the full multi-line suggestion text and the command, without the command line leaking into
    the suggestion text.
  - The existing single-line cases (`:64-86`) continue to pass unchanged — they exercise the
    same code path and should not regress.

## Out of scope

- `SUGGESTION_FORMAT`'s prompt instructions (`:69-77`) — still ask for "one or two short
  sentences"/"one short sentence"; this fix only makes the *parser* tolerant of personas that
  reply with more, it doesn't change what personas are instructed to write.
- Any rendering/formatting of the delivered text once parsed — out of scope, unaffected by this
  fix.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected server tests.
- Manual: not practical to drive a live monitor session in this environment; covered by the unit
  tests above instead.
