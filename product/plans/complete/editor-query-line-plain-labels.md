# Remove brackets from the editor query line's status pill and drop its placeholder span

**Complexity: 2/10** — text-content changes to an existing pure function and one prop/branch removal in an existing render component. No new state, no structural changes.

## Goal

The in-editor persona query line's status pill (`product/specs/editor-tab.md:284-293`) currently renders its text wrapped in literal brackets — `[agent?]`, `[query?]`, `[run]`, `[running...]`, `[no suggestion]` — and the query line also shows a placeholder span with the text "persona request…" before anything is typed. Per the backlog request, remove the brackets from the pill text and remove the `editor-placeholder` span entirely.

## Approach

`suggestPillLabel` in `web/src/editor/suggest-request.ts:61-78` is the single source of the pill's text; its five return values just need the surrounding `[`/`]` stripped. The `pill.text` string is rendered verbatim in `web/src/editor/render.tsx:83`, so no rendering change is needed there beyond the text itself.

The placeholder span (`web/src/editor/render.tsx:82`) and its `placeholder` prop (`LineProps.placeholder`, `render.tsx:41`) and the value passed at the call site (`web/src/editor/EditorLines.tsx:91`) are only used for this one span — removing the span means the prop is dead, so remove the prop too rather than leaving it unused. The CSS rule `.editor-placeholder` (`web/src/theme.css:670`) becomes unused and should be removed.

## Implementation steps

1. In `web/src/editor/suggest-request.ts`, strip the brackets from the five pill text literals in `suggestPillLabel` (lines 71, 73, 74, 76, 77): `'[agent?]'` → `'agent?'`, `'[query?]'` → `'query?'`, `'[running...]'` → `'running...'`, `'[no suggestion]'` → `'no suggestion'`, `'[run]'` → `'run'`.
2. In `web/src/editor/render.tsx`, remove the `editor-placeholder` span (line 82) and the now-unused `placeholder` field from `LineProps` (line 41) and from the destructure at line 73.
3. In `web/src/editor/EditorLines.tsx`, remove the `placeholder="persona request…"` prop passed to `EditorLine` in `renderQueryRow` (line 91).
4. Remove the now-unused `.editor-placeholder` rule from `web/src/theme.css:670`.

## Tests

- `web/src/editor/suggest-request.test.ts:82-116` — update the five expected pill texts to the bracket-free strings (`'agent?'`, `'query?'`, `'run'`, `'running...'`, `'no suggestion'`), matching the new `suggestPillLabel` output.
- `web/src/editor/render.test.tsx:59` — update the sample pill's `text: '[run]'` to `text: 'run'`.
- `web/src/editor/render.test.tsx:80-99` — the two tests asserting `.editor-placeholder` presence/absence via the `placeholder` prop no longer apply since the span is removed; replace them with a single test confirming `.editor-placeholder` is never rendered (e.g. assert `container.querySelector('.editor-placeholder')` is `null` for a query row with empty text), and drop the now-nonexistent `placeholder` prop from any remaining `EditorLine` test invocations.
- `web/src/EditorTab.test.tsx:489-499` — the placeholder-text assertion at line 497 no longer applies; remove or rewrite that assertion to no longer expect an `.editor-placeholder` element.
- Run `./scripts/run.mjs check-diff` after each step; all suites must pass.

## Spec updates

- `product/specs/editor-tab.md:220` — "The query line shows a `>` prompt marker followed by placeholder text reading "persona request…" until something is typed." — remove this sentence; the query line no longer shows placeholder text.
- `product/specs/editor-tab.md:227` — "clicking the `[run]` pill" → "clicking the `run` pill".
- `product/specs/editor-tab.md:284-291` — update the bracket-quoted pill text descriptions (`` `[agent?]` ``, `` `[query?]` ``, `` `[run]` ``, `` `[running...]` ``, `` `[no suggestion]` ``) to their bracket-free equivalents.

## Docs

- Checked `help.md` — no mention of the query line pill or placeholder text. No update needed.
- Checked `documentation/user-documentation/` — no page describes the pill's bracket styling or the placeholder text. No update needed.

## Out of scope

- Escape-key cancellation behavior (separate backlog issue).
- The query line's gutter line number (separate backlog issue).
- The query line's modality relative to buffer editing (separate backlog issue).
- Any other status-pill styling (color, positioning) — only its text content changes.
