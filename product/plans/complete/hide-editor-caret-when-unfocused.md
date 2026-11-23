# Hide the editor caret while keyboard focus is outside the editor

**Complexity: 2/10** — a single CSS rule in one production file, 4 requirements and 4 test scenarios, all in the existing caret styling (p=3.90).

## Goal

The blinking caret should disappear when the editor tab no longer holds keyboard focus. The issue text is: "when an editor tab looses focus, the blinking cursor should no longer be visible." An active editor already hides its caret when the tab is switched away or a picker opens, but focus can leave the editor surface while the tab stays active — into the metadata rename input, the buffer find field, the command bar, or the other pane of a split — and the bar keeps blinking there. A blinking caret where the next keystroke will not land is misleading, so it should go dark until focus returns.

## Requirements

1. "when an editor tab looses focus, the blinking cursor should no longer be visible." While keyboard focus is outside the editor body — on the rename input, the find field, the command bar, or another pane — the caret's blinking bar is not painted.
2. Returning keyboard focus to the editor body makes the blinking bar visible again immediately, without a tab switch, reload, or cursor move.
3. Suppressing the bar leaves the zero-width caret element and its position in the text flow untouched, so the cursor-into-view scroll still measures the same element and no surrounding text shifts.
4. Focus on a control inside the editor body, such as a suggestion pill or a hunk accept/decline button, still counts as focus within the editor and keeps the caret visible.

## Design decisions

- Suppress the paint in CSS with `.editor-body:not(:focus-within) .editor-caret::after`, rather than adding a `focused` state in React. `:focus-within` is exactly "the keyboard is somewhere in this editor body", it needs no focus handlers or props, and the shell tab already gates its own focus cue the same way (`web/src/plugins/shell/shell.css:31`).
- Keep the caret span in the DOM and hide only its painted bar (`animation: none; opacity: 0`). The caret element is a zero-width inline marker that `caretRef` measures for scrolling; removing or collapsing it would change that measurement, while a `::after` rule changes only what is drawn.
- Let the existing `active && !overlayOpen` gate keep deciding whether a caret span exists at all. The new rule is the second, independent gate: one decides whether there is a caret, this one decides whether it blinks.
- Scope the rule to `.editor-body`, not the window. Window focus is a separate concept in the app (`web/src/useWindowFocus.ts`) and is deliberately left alone; this fix is about focus leaving the editor tab inside the application.

## Preserved behavior

1. A focused active editor still renders its caret span, and the new rule must not remove the span or change text layout — pinned by `web/src/editor/EditorTab.test.tsx` ("renders a caret span in the active editor"); a regression that hid the element instead of its bar would fail it.
2. An inactive editor still renders no caret span at all, and the new rule must not reintroduce one — pinned by `web/src/editor/EditorTab.test.tsx` ("does not render a caret span when the editor is inactive").
3. The caret is still rendered only on the cursor line, never on other lines — pinned by `web/src/editor/EditorTab.test.tsx` ("renders the caret only on the cursor line, not on other lines").

## Assumptions

1. `web/src/theme.css:884` — `.editor-caret::after` paints the bar with `animation: editor-caret-blink 1s steps(1) infinite`, so `animation: none; opacity: 0` on the same pseudo-element fully suppresses it.
2. `web/src/editor/EditorTab.tsx:107` — an active editor focuses `textareaRef.current?.focus({ preventScroll: true })` once loaded, so an active tab's `.editor-body` is normally `:focus-within`; the rule therefore hides the caret only when focus has genuinely moved away.
3. `web/src/theme.css:871` — `.editor-body` is the element that wraps the hidden textarea and the rendered lines, so every in-editor focus target is a descendant and every out-of-editor one is not.
4. `web/src/plugins/shell/shell.css:31` — `.shell-body:focus-within::before` is the established in-repo precedent for gating a tab's focus cue on `:focus-within`.
5. `web/src/editor/EditorLines.tsx:58` — `caretCol` is already gated on `active && suggest.focusTarget === 'buffer'`, so the focus rule never has to change which line or column the caret marks.

## Existing functionality

1. `.editor-caret::after` in `web/src/theme.css:884` paints the blinking bar — the rule this fix extends with a focus condition.
2. The `bodyRef` on `.editor-body` in `web/src/editor/EditorTab.tsx:175` is the element whose `:focus-within` state the new selector reads.
3. `.shell-body:focus-within::before` in `web/src/plugins/shell/shell.css:31` is the existing focus gate whose pattern the new rule mirrors.

## Implementation steps

1. In `web/src/theme.css`, immediately after the `.editor-caret::after` rule and the `@keyframes editor-caret-blink` rule, add `.editor-body:not(:focus-within) .editor-caret::after { animation: none; opacity: 0; }` with a short comment naming the reason: the bar must not blink while the keyboard is elsewhere in the app. No component, hook, prop, or state changes. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/theme.test.ts`, add a case under `describe('editor theme')` that reads the rule from the imported `theme.css?raw` and asserts it disables the blink animation and fully hides the bar, and that it is scoped to `.editor-body:not(:focus-within)` rather than the whole window. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Update the functional spec `product/specs/editor-tab.md` in its Caret section: the caret is hidden not only when the tab is inactive or a picker is open, but also when keyboard focus leaves the editor body, and returns when focus comes back. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update `documentation/user-documentation/tab-types/editor.md` in "Caret and scroll", whose sentence currently says the blinking caret is only visible while the tab is active: add that it also goes out when focus moves to another field, such as the rename input, find field, command bar, or another pane, and comes back when the editor takes focus again. No `help/` page describes caret visibility, so none changes. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Promote the plan, remove the fixed backlog entry, verify, and merge. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. Only the blinking caret bar's visibility changes; its colour, width, height, position, and blink timing while focused are unchanged.
2. When focus leaves the editor body, the bar disappears with no layout change — the surrounding text keeps its exact position.
3. When focus returns, the bar resumes blinking at the current cursor column without any reload or tab switch.
4. No new controls, states, or key bindings, and no change to the caret's behavior while a picker overlay is open or the tab is inactive.

## Tests

1. In `web/src/theme.test.ts`, add one case under `describe('editor theme')` that matches `.editor-body:not(:focus-within) .editor-caret::after { ... }` from the raw stylesheet and asserts `animation: none` and `opacity: 0`, and that the selector contains `:not(:focus-within)` (Requirements 1, 3, 4).
2. The existing caret cases in `web/src/editor/EditorTab.test.tsx` — rendered when active, absent when inactive, only on the cursor line — stay passing unchanged (Requirements 2, 3; Preserved behavior 1–3).

## Out of scope

- Window focus: the app's separate `windowFocused` signal and the tab-border dimming it drives are not touched; this fix is about focus inside the application.
- Changing how the caret is gated on `active`, `overlayOpen`, or `suggest.focusTarget` — those continue to decide whether the caret span exists and where it sits.
- Removing or collapsing the caret element itself, or any change to cursor scrolling, selection rendering, or text layout.
- New documentation: only the two pages that already describe caret visibility are updated in place; nothing new is created.
- No `help/` changes: no command, flag, key binding, or command page documents caret visibility.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Manual check against the running app:

1. Open an editor tab with content and confirm its caret blinks. Click the tab's name to start renaming, or press `Cmd+F` to open the find field, and watch the editor body: the bar should vanish the moment focus leaves the buffer, with no text shifting. Press `Escape` or close the field to return focus; the bar should resume blinking at the same cursor column. A failure looks like the bar continuing to blink while you are typing in the rename or find field.
2. With a split showing two editor tabs, focus one and confirm only its caret blinks; the other pane shows no bar. Click into the second pane and confirm the caret swaps to it.
