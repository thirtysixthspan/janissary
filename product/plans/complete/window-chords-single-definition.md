# Define the window tab-switch and picker chords once

## Complexity

3/10 — one new pure module in the shared terminal layer with its own tests, and three call sites rewritten to ask it; no wire change and no behavior change.

## Goal

The window key handler in `web/src/useWindowKeys.ts` owns the tab-switch chords (Shift+←/→, Cmd+Shift+[/] and their shifted `{`/`}` forms) and the Ctrl+A/Ctrl+G picker openers. The full-tab terminals decide which keys to let bubble to that handler by restating the same chords in their own predicates: `harnessKeyFilter` in `web/src/harness/HarnessTab.tsx` re-derives the tab-switch chord and Ctrl+A/Ctrl+G, and `shellKeyFilter` in `web/src/ShellTab.tsx` re-derives the tab-switch chord again. Three copies of "keys the window owns" drift independently, so a changed window chord silently stops working while focus is in a harness or shell terminal. Give those chords one definition that all three read.

## Approach

Add a pure module `web/src/shared/terminal/window-chords.ts` exporting two predicates:

- `isTabSwitchChord(e)`: Shift+ArrowLeft/ArrowRight without Ctrl, or Cmd+Shift with `[`, `{`, `]`, or `}`. This is exactly the condition both terminal filters and the window's `moveTab` branches test today.
- `isPickerChord(e)`: bare Ctrl+A or Ctrl+G (case-insensitive key, no Shift, Alt, or Meta). This is exactly the condition `harnessKeyFilter` tests today.

Rewrite the callers:

- `shellKeyFilter` returns `!isTabSwitchChord(e)` after its keydown check.
- `harnessKeyFilter` keeps its keydown check and its picker-open early return, then returns `!(isTabSwitchChord(e) || isPickerChord(e))`.
- `handleTabShortcuts` in `web/src/useWindowKeys.ts` replaces its four `moveTab` branches with one branch gated on `isTabSwitchChord(e)`, choosing the direction locally (`ArrowLeft`, `[`, and `{` move left; the rest move right). The Ctrl+Arrow reorder branches stay before it and are disjoint from it, since the arrow half of the chord excludes Ctrl.

The terminals' deliberate differences stay where they are: Ctrl+←/→, Ctrl+R, and Ctrl+E are not part of either predicate, so they keep going to the PTY for word motion, reverse search, and end-of-line. `cardKeyFilter` in `web/src/shared/transcript/TerminalCard.tsx` keeps its deliberately coarser rule (every Shift or Ctrl key bubbles) and is not touched.

`shared` is the right layer: the app shell (`useWindowKeys.ts`), the `harness` feature, and the root-level `ShellTab.tsx` all consume it, and a feature may import shared but not another feature.

### Rejected alternative

Having the window handler's `ctrlChordOpener` also read `isPickerChord`. The window opens its pickers on any Ctrl+letter (including with Shift), a coarser rule than the terminals need, and narrowing it would be a behavior change outside this item.

## Implementation

1. Add `web/src/shared/terminal/window-chords.ts` with `isTabSwitchChord` and `isPickerChord`, and its colocated test.
2. Rewrite `shellKeyFilter` in `web/src/ShellTab.tsx` and `harnessKeyFilter` in `web/src/harness/HarnessTab.tsx` to use them.
3. Rewrite the `moveTab` branches of `handleTabShortcuts` in `web/src/useWindowKeys.ts` to use `isTabSwitchChord`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

New `web/src/shared/terminal/window-chords.test.ts`:

- `isTabSwitchChord` accepts Shift+ArrowLeft and Shift+ArrowRight, and Cmd+Shift with each of `[`, `{`, `]`, `}`.
- `isTabSwitchChord` rejects Ctrl+Shift+ArrowLeft, plain ArrowLeft, Ctrl+ArrowLeft, plain Cmd+`[` without Shift, and Shift+ArrowUp.
- `isPickerChord` accepts Ctrl+A and Ctrl+G in either key case.
- `isPickerChord` rejects Ctrl+A with each of Shift, Alt, or Meta, and rejects Ctrl+R, Ctrl+E, and a bare `a`.

`web/src/harness/HarnessTab.test.tsx`, `web/src/ShellTab.test.tsx`, and `web/src/useWindowKeys.test.ts` already exercise these chords and must pass unchanged.

## Spec

No behavior changes, but the input-model sections were incomplete and should name the single definition. `product/specs/harness.md` (Input model): list Cmd+Shift+[/] beside Shift+←/→, add the bare Ctrl+A/Ctrl+G picker chords and the open-picker case to the bubbling exceptions, and note that the chords are defined once and shared by the window handler and both terminals. `product/specs/shell.md` (PTY takeover mode): name Cmd+Shift+[/] alongside Shift+←/→ as the one bubbling chord.

## Docs

None: no documented behavior changes.

## Out of scope

- `cardKeyFilter` in `web/src/shared/transcript/TerminalCard.tsx`, whose coarser rule is deliberate.
- The window's `ctrlChordOpener` and its other Ctrl chords.
