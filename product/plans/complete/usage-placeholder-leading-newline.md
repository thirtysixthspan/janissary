# Render placeholders in a usage reply that arrives with a leading newline

**Complexity: 2/10** — one client file and one behavior: treat a single-line `Usage:` reply with surrounding whitespace as command text (~4 added lines, 2 requirements, 4 scenarios, p=3.59).

## Goal

Bare `notify` prints `Usage: notify .` in a shell tab instead of `Usage: notify <message>.`. The server sends the right text, but as two appended entries joined with a leading newline, and the transcript renderer only escapes angle brackets when the reply begins with `Usage:` at position zero. That leading newline sends it down the Markdown path, where `<message>` is read as an HTML tag and dropped by the sanitizer. Fix the renderer so a single-line usage reply with leading or trailing whitespace keeps its placeholders.

## Root cause

`literalUsage` in `web/src/shared/transcript/markdown.ts` gates on `/^Usage: [^\n]*\n?$/`, which rejects any reply starting with whitespace. The bare `notify` capture is `\nUsage: notify <message>.`, so no escaping happens; `marked` parses `<message>` as raw HTML and `DOMPurify` removes the unknown element together with its text. Other usage replies such as `tab focus` and `commands nope` have no leading newline and render correctly, which isolates the defect to the whitespace gate.

## Correct behavior

A reply whose first non-whitespace content is a single `Usage: ` line, with only whitespace around it, renders as command text: its angle-bracket placeholders survive verbatim and the surrounding whitespace is preserved. Replies that are not a single usage line, ordinary single-line Markdown, and legitimate inline HTML stay on the existing Markdown path.

## Reproduction

Added a failing test in `web/src/shared/transcript/markdown.test.ts` that renders `\nUsage: notify <message>.` and reads the resulting text content. Before the fix it produces `Usage: notify .\n`; the placeholder is gone. The server text is correct (`src/commands/notify.ts` appends `Usage: notify <message>.`), so the defect is purely in client rendering.

## Approach

Keep the escaping rule and widen only the detection gate. Match the reply as leading whitespace, a single `Usage: ` line, and trailing whitespace; escape `<` and `>` in the middle segment only; then reassemble with the original whitespace. Every other reply stays on the existing path. Changing the server capture shape instead would make `notify` diverge from every other usage reply, so the fix belongs in the renderer.

## Implementation steps

1. `web/src/shared/transcript/markdown.ts` — replace the anchored gate in `literalUsage` with a match that captures leading and trailing whitespace around a single-line `Usage: ` body, escapes brackets in the captured body, and rejoins the three parts. Keep the existing comment above the function; it still explains why the escaping exists.
2. Update `product/specs/application-commands.md` so the usage-placeholder paragraph says surrounding whitespace does not stop a reply from being treated as command text.

## Regression test

`web/src/shared/transcript/markdown.test.ts` — `renders a usage reply with a leading newline with its placeholders literal` renders `\nUsage: notify <message>.` and asserts the visible text is `Usage: notify <message>.\n`. It fails against the current code (`Usage: notify .\n`) and passes with the fix. The surrounding cases (whole-line usage, ordinary Markdown, raw HTML) guard against the widened gate catching unrelated replies.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` passes, including the new regression test.

Live E2E: start a scratch instance, open a shell tab, type bare `notify` into the command bar, and read the reply under the echoed line. The driver records the visible reply text; it must contain `Usage: notify <message>.` with the angle-bracket placeholder intact. The driver lives under `./temp/fix-a-bug-drivers/` so it survives the scratch-root teardown. If the start task cannot build in this environment or the browser is unavailable, record the reason and skip the live check.

## Out of scope

- Changing the server capture shape (`src/commands/notify.ts`, `src/capture/execute-and-capture.ts`) or the invocation-id threading in `src/command/manager.ts`. The text is correct; only rendering is wrong.
- The separate `shell --bogus` placeholder bug, whose reply has a prefix before `Usage:` rather than leading whitespace. That needs its own fix and is tracked as its own backlog entry.
- General HTML escaping outside usage replies.
