# Keep placeholders in a usage reply that follows a prefix

**Complexity: 2/10** — one client file and one behavior: escape brackets in a `Usage:` segment wherever it sits in a single-line reply (~5 added lines, 2 requirements, 5 scenarios, p=3.72).

## Goal

`shell --bogus` shows `[on ]` instead of `[on <address>]` in a shell tab. The server produces the full usage sentence, but it prefixes it with `Unknown option "--bogus". `, and the transcript renderer only escapes angle brackets when a reply *starts* with `Usage: `. The bare `<address>` then becomes a real HTML element, splits the paragraph, and is removed by the sanitizer. Escape the usage segment wherever it appears in a single-line reply so the placeholder survives.

## Root cause

`literalUsage` in `web/src/shared/transcript/markdown.ts` matched a `Usage:` line only at the start of the text (after the leading-whitespace tolerance added by the earlier `usage-placeholder-leading-newline` fix). A prefixed reply has text before `Usage: `, so it fell through to `marked`, which reads `<address>` as an HTML tag. `DOMPurify` drops the unknown element and its text, leaving `[on ]`. `<name|id>` survives the same path only because `|` is not a valid tag-name character, which is why the blank slot is easy to overlook.

## Correct behavior

For a single-line reply, the portion starting at `Usage: ` and running to the end of the line is command text: its angle-bracket placeholders survive verbatim. Any prefix before that segment, and leading or trailing whitespace, is left exactly as it arrived. Multi-line replies, ordinary single-line Markdown, and legitimate inline HTML keep the Markdown path.

## Reproduction

Added a failing test in `web/src/shared/transcript/markdown.test.ts` that renders `Unknown option "--bogus". Usage: shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>] [in group <name|id>]` and asserts the visible text is unchanged. Against the current code it produces `[on ]` with the `<address>` token gone. `SHELL_USAGE` in `src/plugins/shell/parse-argument.ts` already contains the right text, so the defect is purely client-side rendering.

## Approach

Generalize the single detection gate rather than adding a second one. Match a single-line body that contains `Usage: `, keep everything before that substring untouched, and escape brackets only in the substring from `Usage:` onward. The match still rejects replies with an internal newline and replies with no `Usage: ` at all, so multi-line messages, Markdown, and inline HTML are unaffected. The earlier leading-whitespace behavior stays: the whitespace is matched outside the body and reattached unchanged.

## Implementation steps

1. `web/src/shared/transcript/markdown.ts` — replace the anchored `literalUsage` match with one that captures leading whitespace, a single-line body containing `Usage: `, and trailing whitespace; split the body at the first `Usage: `, escape brackets in the `Usage:` part only, and rejoin. Keep the no-comment house style; the existing comment above the function still explains why the escaping exists.
2. Update `product/specs/shell-tab.md` so the unknown-option paragraph says the usage placeholders display literally even when the usage follows a refusal prefix.

## Regression test

`web/src/shared/transcript/markdown.test.ts` — `renders a prefixed usage reply with its placeholders literal` asserts the full `Unknown option "--bogus". Usage: shell …` string is visible with `[on <address>]` and `<name|id>` intact. It fails against the current code (`[on ]`) and passes with the fix. The existing cases (whole-line usage, leading-newline usage, ordinary Markdown, raw HTML) guard against the generalized gate changing unrelated replies.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` passes, including the new regression test.

Live E2E: start a scratch instance, open a shell tab, type `shell --bogus` into the command bar, and read the reply under the echoed line. The driver records the visible reply text; it must contain `[on <address>]` with the angle brackets intact. The driver lives under `./temp/fix-a-bug-drivers/` so it survives the scratch-root teardown. If the start task cannot build here or the browser is unavailable, record the reason and skip the live check.

## Out of scope

- Changing `SHELL_USAGE` or `parseShellArgument` in `src/plugins/shell/parse-argument.ts`. The server string is already correct.
- Routing the rejection through a different transcript path. That would diverge from every other usage reply and from the command-output conventions the app already uses.
- Escaping angle brackets in arbitrary reply prefixes. Only the `Usage: ` segment is treated as command text.
