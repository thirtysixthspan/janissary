# Qualify the second-Cmd+F sentence to the overlay's input

**Complexity: 3/10** — a spec correction in two files. No source, test, or user-documentation change. The rating matches the recorded 3/10 review risk: the old sentence makes an unconditional promise the code only keeps while the overlay's input has focus, and a reader or later test can build on it.

Work item, verbatim: *"qualify the editor and shell specs' second-Cmd+F sentence to the overlay's input"*.

## Goal

Make `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search say exactly where a second Cmd+F selects the query: in the overlay's input. Leave the focus-outside behavior, where the tab handles Cmd+F and opens the overlay with an empty query, as a separate product decision.

## Problem

Both sections currently say that pressing Cmd+F again while the find overlay is open selects the whole query. That is only true while the overlay's input holds keyboard focus.

- `LineFind` in `web/src/shared/line-find/LineFind.tsx` attaches its `onKeyDown` wrapper to the input. When that input receives Cmd+F, the wrapper prevents the default, stops propagation, and calls `event.currentTarget.select()`. Nothing else receives that branch.
- When focus is in the editor buffer, `useEditorInteractions.claimKey` in `web/src/editor/useEditorInteractions.ts` maps Cmd+F to `action.kind === 'find'` and calls `find.open()`. `useLineFind.open` defaults its initial query to an empty string, so the query is replaced with an empty one rather than selected.
- When focus is elsewhere in a shell tab, the claimed chord handler in `web/src/plugins/shell/ShellTab.tsx` calls `openFind('')`, and `useShellTranscriptFind.open` passes that empty query to `useLineFind.open`. The existing transcript is opened empty.

So the claim is accurate for the input and wrong for every other focus position. A reader of either spec cannot tell that distinction from the current sentence.

## Decision

Qualify the sentence to the overlay's input rather than changing the focus-outside behavior. Wiring focus and selection for the tab-level path is a behavior change with its own risk, and this review item is explicitly a spec correction.

The existing tests already pin both sides of the corrected wording:

- `web/src/shared/line-find/LineFind.test.tsx` covers Cmd+F in the input selecting the whole query.
- `web/src/plugins/shell/ShellTab.test.tsx` covers the claimed Cmd+F opening an empty transcript find.
- `web/src/editor/EditorTab.test.tsx` covers the buffer's Cmd+F opening the overlay, including reopening it empty after the tab goes inactive.

No test asserts the old unconditional sentence, so no test changes are needed.

## Implementation steps

1. In `product/specs/editor-tab.md` § Finding a line, change the sentence "Pressing Cmd+F again while the overlay is open selects the whole query, so typing replaces it." to "Pressing Cmd+F again in the overlay's input selects the whole query, so typing replaces it." Keep the surrounding text and wrap the paragraph naturally.
2. In `product/specs/shell-tab.md` § Transcript search, change "Pressing `Cmd+F` again while the overlay is open selects the whole query, so typing replaces it, and the browser's find bar does not open." to "Pressing `Cmd+F` again in the overlay's input selects the whole query, so typing replaces it, and the browser's find bar does not open." Keep the browser-find-bar clause and wrap the paragraph naturally.
3. Run `$janissary/scripts/run.mjs check-diff`.
4. Move this plan from `product/plans/draft/` to `product/plans/ready/` before implementation, then to `product/plans/complete/` after the specs and checks pass.
5. Remove the resolved entry from `product/backlog/pull-request.md` whole, restoring the exact comment-and-heading skeleton because it is the only entry.

## Tests

None added. The change is to prose and changes no behavior. The existing tests named under Decision already cover input-focused selection and the tab-level empty open, and `check-diff` gates the change.

## Spec

`product/specs/editor-tab.md` and `product/specs/shell-tab.md` are the only specs changed, as described under Implementation steps.

## Docs

None needed. No `help/` page or `documentation/user-documentation/` page describes the second-Cmd+F selection behavior, and this correction changes no behavior a user sees.

## Out of scope

- Changing `LineFind`, `useEditorInteractions`, `ShellTab`, `useShellTranscriptFind`, or any test.
- Wiring focus and selection for the focus-outside case so a tab-level Cmd+F preserves and selects the query.
- The PDF tab's find overlay and its spec, which handle focus outside the input separately.
- Rewriting historical plan files that quoted the original wording. They record what was planned at the time; the live specs are the source of truth.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Search both spec sections for the old wording and confirm the new sentence names the overlay's input and no other copy of the unconditional claim remains.
