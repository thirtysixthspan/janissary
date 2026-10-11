# Render diff command placeholders literally in transcript refusals

**Complexity: 2/10** — the fix is confined to diff command messages, their tests, and the existing diff spec.

## Goal

Show angle-bracket placeholders literally in transcript refusals and usage messages produced by the `diff` command.

## Approach

Escape `<` and `>` for Markdown where the diff command creates refusal text, including dynamic tab names and paths. Store the static usage message with escaped delimiters as well. Keep the shared Markdown renderer unchanged because raw HTML is part of its existing behavior, and other message producers already escape placeholders at their boundary.

## Implementation steps

1. Add a small diff-message escaping helper and use it for invalid paths, unknown workspaces, and workspaces that are still provisioning. Escape the delimiters in `DIFF_USAGE`.
2. Update the affected diff command tests to expect escaped message source and add transcript-rendering coverage for the no-workspace and usage messages.
3. Update `product/specs/diff-tab.md` to state that placeholders display literally and document the usage refusal.

## Tests

- `src/plugins/diff/activate.test.ts` verifies diff refusal messages carry Markdown-escaped angle brackets, including user-supplied path or tab text.
- `src/plugins/diff/parse-argument.test.ts` verifies the parse error uses the escaped usage message.
- `web/src/shared/transcript/markdown.test.ts` renders the exact no-workspace and usage message forms and asserts their visible text retains `<no-such-tab>` and `<tab name>`.

Run `../../../scripts/run.mjs check-diff` after each implementation step.

## Spec updates

- `product/specs/diff-tab.md` — specify literal placeholder rendering and the `Usage: diff [path] [on <tab name>]` refusal when a path and clause are combined.

## Docs

`help.md` and the diff user guide already use literal angle-bracket syntax and do not need changes.

## Out of scope

- Changing the shared Markdown renderer's raw-HTML handling.
- Escaping placeholders produced by other plugins.
