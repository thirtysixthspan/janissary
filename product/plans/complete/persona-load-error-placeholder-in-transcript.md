# Keep the persona load-error placeholder visible in the transcript

**Complexity: 2/10** — narrow change in one web module (`markdown.ts`): one new helper (~10 added lines), one behavioral requirement (print the literal `<role>` placeholder), with markdown links and raw HTML left intact (p ≈ 3.82).

## Goal

A malformed or missing persona directive fails to load with the exact message `Persona "<name>": expected first line [//]: # role: <role>.`, but the transcript shows `... role: .` — the `<role>` placeholder is silently swallowed. Make the rendered transcript show the whole literal message, including `<role>`, so the correct directive syntax is visible where the failure is reported. The message string itself stays unchanged: the server, tests, spec, and docs already carry the exact text with `<role>`.

## Approach

The failure is purely in the browser's markdown rendering. `renderLine` renders markdown lines through `Markdown`, which calls `renderMarkdown` in `web/src/shared/transcript/markdown.ts` and injects the result with `dangerouslySetInnerHTML`. Marked reads a bare `<role>` as an unknown HTML element and DOMPurify drops the element together with its text.

The module already solves the same class of problem for one-line `Usage:` replies: `literalUsage` backslash-escapes angle brackets before marked runs, so the placeholders print literally while real HTML elsewhere keeps rendering. Extend that mechanism with a sibling helper that applies the same escaping to persona error lines, identified by their `Persona "` prefix. Marked turns `\<` / `\>` back into literal characters in the HTML path, so `textContent` contains `<role>`.

Keep the change scoped to `web/src/shared/transcript/markdown.ts` and its colocated test, plus the transcript-line render test. No server file changes: escaping the source message would corrupt the literal string that tests, the spec, and the docs assert on, and would leak backslashes into non-markdown consumers such as `errorFirstLine`.

## Implementation steps

1. In `web/src/shared/transcript/markdown.ts`, add a `literalPersonaError(text: string)` helper that returns `text` unchanged unless it starts (after optional whitespace) with `Persona "`, and otherwise backslash-escapes every unescaped `<` and `>` using the same `/(?<!\\)[<>]/g` replacement `literalUsage` uses. Document why persona errors need it.
2. Apply `literalPersonaError` to the input in `renderMarkdown` before `marked.parse`, composing it with the existing `literalUsage` call. Leave the two helpers independent so neither changes the other's cases.
3. Confirm `markdown.ts` stays well under the 200-line limit (it is ~23 lines today), so no extraction is needed.

## Tests

- `web/src/shared/transcript/markdown.test.ts`: assert `renderMarkdown('Persona "researcher": expected first line [//]: # role: <role>.')` yields visible `textContent` equal to that full literal string (plus marked's trailing newline), and that the HTML contains the bracket entity rather than a `<role>` element. Add a case covering the related persona errors that also name `<role>` / `<persona>` placeholders. Keep every existing test, especially the markdown-link and raw-HTML cases, unchanged and passing.
- `web/src/shared/transcript/transcript-line.test.tsx`: in the markdown describe block, render a `type: 'markdown'` line carrying the persona load error through `renderLine` and assert the `.line.markdown` text contains the full literal `expected first line [//]: # role: <role>.`. The existing markdown-link click assertions stay intact and must keep passing.

Verify with `$janissary/scripts/run.mjs check-diff` after each step and after the tests.

## Specs and docs

`product/specs/acp.md` (Shared consumers) already promises the exact error string including `<role>`; add a short clause noting the transcript shows the directive placeholder literally so the recorded behavior matches the rendered result. `documentation/user-documentation/automation/monitoring.md` already quotes the same exact string, so no public-doc change is needed.

## Out of scope

- Changing the error message in `src/persona-parsing.ts`, `src/personas.ts`, `src/monitor/manager.ts`, or `src/error-text.ts`.
- General angle-bracket escaping for every transcript line, which would break intentional raw HTML and other markdown.
- Changing the PR description or canonical plan.
