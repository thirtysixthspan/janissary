# `>>` shortcut for the assistant editor persona

**Complexity: 2/10** — a small, self-contained change to one pure-parsing module (`personaToken` in
`web/src/editor/suggest-request.ts`); every other suggest-request helper (`parseSuggestRequest`,
`suggestPillLabel`) already derives its behavior from `personaToken`'s return value, so they need no
changes at all. Only `personaTokenRange` needs one extra guard clause.

## Goal

Per the backlog request, typing `>>` at the start of an editor buffer line should be equivalent to
typing `> assistant` — a shortcut that skips naming the persona explicitly and always targets the
`assistant` editor persona (`ai/personas/editor/assistant.md`, per [[editor-tab]]'s in-editor
persona-suggestion feature).

## Approach

`personaToken()` (`web/src/editor/suggest-request.ts:9-17`) is the single point every other helper in
the file (`parseSuggestRequest`, `personaTokenRange`, `suggestPillLabel`) goes through to find the
persona-name word on a `>`-led line. Add a second, earlier branch there: when the line starts with
`>>` (optional leading whitespace, no space required between the two `>` characters), treat the
persona word as the literal string `'assistant'`, positioned as a zero-length token immediately after
the `>>` lead (and any whitespace following it) — so slicing the line from that position for the
prompt yields exactly the text the user typed after `>>`, with no persona word to strip out of it.

Because `parseSuggestRequest` and `suggestPillLabel` already work purely off `token.word` and
`token.end`, they pick up the new shorthand with no code changes: `token.word === 'assistant'` matches
the real `assistant` persona case-insensitively, and `line.slice(token.end)` is the prompt.

The one place that does need a change is `personaTokenRange` (used only for Tab-completion of a
persona name the user is still typing): a zero-length "assistant" token has no text for the user to
complete, so mark the `>>` token as `synthetic` and have `personaTokenRange` return `undefined` for a
synthetic token — this prevents Tab from inserting anything at the caret right after `>>`.

## Implementation steps

1. In `web/src/editor/suggest-request.ts`, add a `synthetic?: boolean` field to `personaToken`'s
   return type.
2. In `personaToken`, before the existing `^\s*>\s*` branch, match `^\s*>>\s*` first; when it
   matches, return `{ start, end: start, word: 'assistant', synthetic: true }` where `start` is the
   matched lead's length.
3. In `personaTokenRange`, add `|| token.synthetic` to the existing early-return guard so a synthetic
   token never offers a completion range.

No changes are needed to `parseSuggestRequest`, `completePersonaName`, or `suggestPillLabel` — they
consume `personaToken`'s output generically.

## Tests

All in `web/src/editor/suggest-request.test.ts`. Add `'assistant'` to the shared `personas` array (it
currently only has `'summarizer'` and `'reviewer'`, and no existing test depends on it being absent).

- `parseSuggestRequest`: `'>> rewrite this paragraph'` with the extended personas list resolves to
  `{ persona: 'assistant', prompt: 'rewrite this paragraph' }`.
- `parseSuggestRequest`: `'>>rewrite this'` (no space after the second `>`) resolves the same way,
  confirming the space between `>>` and the prompt is optional.
- `personaTokenRange`: `personaTokenRange('>> rewrite', 3)` (caret right after the `>>` lead) returns
  `undefined` — there is no persona word to Tab-complete.
- `suggestPillLabel`: `'>> rewrite this'` yields `{ text: '[run]', runnable: true }`, matching the
  named-persona-plus-prompt case.
- `suggestPillLabel`: `'>>'` (no prompt yet) yields `{ text: '[query?]', runnable: false }`, matching
  the persona-named-but-no-prompt case.

Run `./scripts/run.mjs check-diff` after writing the tests.

## Spec updates

- `product/specs/editor-tab.md`, in the "In-editor persona suggestions" section (around line 212,
  right after the `> assistant rewrite this paragraph in one sentence` example): add a sentence noting
  that `>>` at the start of the line is a shorthand for `> assistant`, skipping the persona name.

## Docs

- Checked `help.md` — no mention of the `>`-led persona-suggestion syntax at all. No update needed.
- Checked `documentation/user-documentation/` — no page documents the in-editor persona-suggestion
  request syntax. No update needed (out of scope to add new documentation per the task rules).

## Out of scope

- Issue 2 in the backlog (`>` triggering a separate agent query line instead of inserting a literal
  `>`) — a materially larger change to the core keydown/insertion pipeline, tracked as its own
  backlog entry.
- The save-button tooltip issue — unrelated, tracked as its own backlog entry.
- Any change to how Tab-completion or the status pill behave for the existing `> <persona>` form.
