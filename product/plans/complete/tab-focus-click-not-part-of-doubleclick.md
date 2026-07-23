# Focus click must not count toward a rename double-click

**Complexity: 3/10** — one small handler change in a single component, gated on the browser's native click-count (`MouseEvent.detail`) rather than any new timing logic.

## Goal

When clicking an inactive tab's label to focus it, that click must be "consumed" purely as a
select action. It must not also count as the first half of a native double-click that triggers
the tab-rename editor. Concretely: if a tab was inactive when a click-sequence started, the
resulting native `dblclick` (fired after the second click) must not start renaming, even though
the tab is now active by the time `dblclick` fires. Renaming must still work normally when both
clicks of a double-click happen while the tab was already active — see `product/specs/tabs.md`
("Single-clicking the label of an inactive tab still just selects it... Double-clicking the label
of the already-active tab turns it into an editable text field").

## Root cause

`web/src/TabItem.tsx` selects the tab on `onMouseDown` (so focus happens immediately, per
"Keyboard focus on tab press" in `tabs.md`) and starts the rename editor on the label's
`onDoubleClick`, guarded by `if (!active) return;`. That guard reads the **current** `active`
prop at the moment `dblclick` fires — but by then, the first click's `onMouseDown` has already
called `onSelect`, the parent has re-rendered, and `active` is `true`. So a real double-click on
a previously-inactive tab (first click selects it, second click completes the browser's
double-click detection) passes the guard and incorrectly starts a rename. The existing test for
this ("double-clicking an inactive tab label selects it but does not start renaming") only
passes today because it wires `onSelect` to a `vi.fn()` that doesn't actually flip `active` —
masking the bug in a real, connected app.

## Approach

Use `MouseEvent.detail` — the browser's own native multi-click counter, already correct and
distance/timing-aware without any custom logic — to detect whether a `mousedown` starts a fresh
click gesture (`detail <= 1`) or continues one (`detail >= 2`, the second click of a dblclick).
Capture "was the tab inactive when this gesture started" only on `detail <= 1` mousedowns, into a
ref, and use that ref in the `dblclick` handler instead of the current `active` prop.

- On every `detail <= 1` mousedown, set `gestureStartedInactiveRef.current = !active` before
  calling `onSelect`. On `detail >= 2` mousedowns (second click of a pair), leave the ref alone —
  it already holds the value captured on the first click of this pair.
- In `onDoubleClick`, skip `startEdit()` when `gestureStartedInactiveRef.current` is `true`, in
  addition to the existing `!active` check.

This self-corrects on every new click: a later, independent double-click on the tab (now active)
starts with a `detail <= 1` mousedown that recomputes the ref from the current (already-active)
state, so it isn't blocked by a stale flag from an earlier, unrelated focus click.

## Implementation steps

1. **`web/src/TabItem.tsx`**
   - Add `const gestureStartedInactiveRef = useRef(false);` alongside the existing `cancelledRef`.
   - Change the outer `div`'s `onMouseDown` from `() => { onFocusCommandBar?.(); onSelect(index); }`
     to accept the event and update the ref first:
     ```tsx
     onMouseDown={(e) => {
       if (e.detail <= 1) gestureStartedInactiveRef.current = !active;
       onFocusCommandBar?.();
       onSelect(index);
     }}
     ```
   - Change the label `span`'s `onDoubleClick` guard from `if (!active) return;` to
     `if (!active || gestureStartedInactiveRef.current) return;`.

No other files change — `TabStrip.tsx`, `InlineEditInput.tsx`, and `tab-label.ts` are untouched.

## Tests

Add to `web/src/TabStrip.test.tsx`, mirroring the existing click/dblclick tests (using a stateful
wrapper so `onSelect` actually flips `activeTab`, reproducing the real bug):

- A new small wrapper component (or inline `useState` in the test) that renders `TabStrip` with
  `activeTab` driven by its own `onSelect`, so double-clicking an inactive tab in the test really
  does transition `active` between the two clicks — this is what the current `vi.fn()`-based test
  fails to exercise.
- `double-clicking a tab that starts inactive selects it but does not start renaming, even when
  onSelect updates the active tab` — render two tabs, `activeTab` starts at 0, `userEvent.dblClick`
  the second tab's label, assert the tab became active (`onSelect`/resulting class) and no
  `textbox` role appears.
- `double-clicking a tab that is already active still starts renaming` — regression guard for the
  existing behavior, using the same stateful wrapper, confirming the fix does not disable
  legitimate renaming.

Existing tests in `web/src/TabStrip.test.tsx` (lines 107–151) must continue to pass unmodified.

## Out of scope

- No changes to `onFocusCommandBar`, keyboard focus behavior, or `InlineEditInput`.
- No change to single-click select behavior for already-active tabs.
- No new shared "double-click threshold" constant — `MouseEvent.detail` needs none.
