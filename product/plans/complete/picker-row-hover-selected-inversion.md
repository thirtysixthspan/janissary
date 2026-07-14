# Fix hover/selected color inversion on picker rows

**Complexity: 2/10** — a single CSS specificity fix in one shared stylesheet; no component or state changes.

## Goal

In the task picker (and every other picker that reuses `.picker-row` — queue picker, history
picker, tab-nav picker, theme picker), the keyboard-selected row and the mouse-hovered row are each
styled independently. When the mouse happens to hover the same row the keyboard cursor is on, the
`:hover` background rule overrides the `.selected` background because it comes later in the
stylesheet at equal specificity, while `.selected`'s text color stays applied — producing a
mismatched, inverted-looking combination. The row should look exactly like a keyboard-only
selection when the mouse hovers over it too.

## Approach

`web/src/theme.css:356-359` defines:

```css
.picker-row { display: flex; align-items: center; padding: 3px 10px; cursor: pointer; white-space: nowrap; }
.picker-row.picker-empty { color: var(--muted); cursor: default; }
.picker-row.selected { background: var(--accent); color: var(--bg); }
.picker-row:hover { background: var(--border); }
```

`.picker-row.selected` and `.picker-row:hover` both have specificity (0,2,0); source order lets
`:hover` win on background while `.selected`'s `color: var(--bg)` (chosen for contrast against the
accent background) still applies, giving `var(--bg)`-colored text on a `var(--border)` background.

Add a higher-specificity rule for the combined state, `.picker-row.selected:hover` (specificity
0,3,0), matching `.selected` exactly, right after the existing `:hover` rule. This is the same
idiom the file already uses for per-picker selected overrides (e.g. `.tab-nav-picker .picker-row.selected mark`
at `web/src/theme.css:365`). No React/JS changes are needed — mouse hover is a pure CSS
pseudo-class here; no component tracks hover state.

This single shared-CSS fix applies to every picker built on `.picker-row`
(`TaskPicker.tsx`, `QueuePicker.tsx`, `HistoryPicker.tsx`, `TabNavPicker.tsx`, `ThemePicker.tsx`),
matching the issue's mention of "similar windows."

## Implementation steps

1. In `web/src/theme.css`, after line 359 (`.picker-row:hover { background: var(--border); }`),
   add:
   ```css
   .picker-row.selected:hover { background: var(--accent); color: var(--bg); }
   ```

## Tests

CSS-only change; JSDOM tests can't assert `:hover` pseudo-class rendering, and no existing picker
test suite does so. No new automated test is added for this change — verification is manual (see
Verification below). This is consistent with how the file's other pseudo-class rules (e.g. plain
`.picker-row:hover`) are untested today.

## Spec

Add a short note to `specs/task-picker.md`'s "Picker behavior" section stating that hovering the
keyboard-selected row keeps the row's selected appearance (no visual conflict between keyboard and
mouse highlighting).

## Verification

- `./scripts/run.mjs check-diff` — lints the changed CSS file (typecheck/tests are a no-op for a
  pure CSS change but the command still runs cleanly).
- Manual: open the task picker (`Ctrl+A`), move the keyboard selection to a row, then hover that
  same row with the mouse — confirm the row's background/text stay the accent/bg combination with
  no flash to the border-color hover style. Hover a different row and confirm it still shows the
  plain hover background while the keyboard-selected row keeps its own highlight.

## Out of scope

- Adding JS-tracked hover state to any picker component — the fix is pure CSS.
- Any behavior changes to keyboard selection, mouse click-to-select, or picker navigation.
