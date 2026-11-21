# Share one bracket-marker field extractor between the monitor and editor-suggest reply parsers

**Complexity: 3/10** — ~20 added lines, 2 files edited, 4 requirements, 8 scenarios (p=4.68); one new pure leaf module and two small call-site edits, no behavior change.

## Goal

Reading the text after a `[NAME]:` marker in a persona reply is implemented twice with the same regular expression: a private `captureMarker` in `src/monitor/reply-format.ts` for the monitor's `[SUMMARY]`/`[SUGGESTION]`/`[COMMAND]` format, and a private `captureField` in `src/editor-suggest/reply-format.ts` for the `[ANCHOR]`/`[REPLACEMENT]` hunk format. The two differ only in the whitespace class allowed after the colon (`\s*` in the monitor, `[ \t]*` in the editor). A fix to the marker boundary or the whitespace class applied to one parser leaves the other silently dropping or swallowing reply content. Own the rule in one place so both parsers agree.

## Approach

Extract a single `captureMarker(reply, name)` into a new leaf module `src/shared/persona-reply-markers.ts`. Both parsers import it directly (NodeNext `.js` extension) and delete their private copies. The two behaviours do not genuinely need to differ: both callers `.trim()` the captured value, so a value that starts on a later line is returned identically. Standardize on the editor's `[ \t]*` class rather than the monitor's `\s*`: `\s*` would also consume the newline that separates an empty in-line value from a following `[NAME]:` line, letting the empty field swallow the next marker as its value, which is exactly the marker-boundary drift this item guards against. Record that rationale in a short comment in the new module, as the backlog entry asks.

Leave each parser's marker vocabulary, format instructions (`SUGGESTION_FORMAT`, `HUNK_FORMAT`), hunk-block grammar, and malformed-block policy where they are. This is a behavior-preserving extraction. The new module is a pure leaf, so it adds no import cycle and no barrel.

## Implementation

1. Add `src/shared/persona-reply-markers.ts` exporting `captureMarker(reply: string, name: string): string | undefined` with the `(?:^|\n)\[NAME]:[ \t]*([\s\S]*?)(?=\n\[[A-Z]+]:|$)` rule and a comment explaining the `[ \t]` choice.
2. In `src/monitor/reply-format.ts`, import `captureMarker` from `../shared/persona-reply-markers.js`, remove the private `captureMarker` and its now-misplaced comment, and leave `parseSuggestion` and `SUGGESTION_FORMAT` unchanged.
3. In `src/editor-suggest/reply-format.ts`, import `captureMarker` from `../shared/persona-reply-markers.js`, remove the private `captureField`, and change the two call sites to `captureMarker(block, 'ANCHOR')` / `captureMarker(block, 'REPLACEMENT')`, leaving `HUNK_FORMAT`, `HUNK_BLOCK_RE`, and `parseHunks`' malformed-block policy unchanged.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- New `src/shared/persona-reply-markers.test.ts`: a case using the monitor's vocabulary (`[SUMMARY]` value spanning multiple lines, stopping before a following `[SUGGESTION]` marker), a case using the editor's vocabulary (`[ANCHOR]` value spanning multiple lines, stopping before `[REPLACEMENT]`), a case where an empty in-line value does not swallow the following marker line, and a no-marker case returning `undefined`. Together these fail if either parser's shared extractor stops recognizing a multi-line field or its marker boundary drifts.
- `src/monitor/parsing.test.ts` and `src/editor-suggest/reply-format.test.ts` keep every existing assertion byte-for-byte and pass unchanged.

## Out of scope

- Each parser's marker names, format instruction strings, and hunk-block grammar.
- The editor's malformed-block drop policy and the monitor's actionable-suggestion-wins policy.
- Any published plugin/client surface; the new module is server-only and imported directly.

## Verification

- `./scripts/run.mjs check-diff` passes.
- A search for `(?:^|\n)\[` regex construction under `src/` finds it only in `src/shared/persona-reply-markers.ts`.

## Documentation and specification impact

None. This is a behavior-preserving refactor; reply parsing is unchanged, so no spec, `help/`, or user-documentation update is needed.
