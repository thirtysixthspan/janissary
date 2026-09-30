# Make the SQL command bar's keys the command bar's own, and Tab move between the bar and the grid

**Complexity: 4/10** — two elements gain focus and a key handler, and one window listener learns
which pane the keystroke was for. No contract change, no server change.

## Goal

The SQL tab has two surfaces that both answer the keyboard: the command bar at the bottom and the grid
above it. Today the grid's arrow-key listener sits on `window`, so an `ArrowUp` pressed in the
command bar to recall a statement also moves the grid's highlighted row. One keystroke, two answers,
and the user is left with a row selected that they did not select.

`ArrowUp` in the command bar recalls a statement, and nothing else happens. `ArrowUp` with the grid
focused moves the highlighted row, and nothing else happens. That is the file navigator's split, and
it is what "the keyboard focus is on the table" has to mean for it to mean anything.

`Tab` moves focus from the command bar to the grid, and `Tab` again brings it back to the command bar.
It is a two-pane tab, and `Tab` is how a user reaches the second pane and returns.

## Approach

Both panes are elements the tab already renders, so both handlers are React `onKeyDown` on the element
itself. Nothing is added to `window`, and nothing else in the tab is disturbed — `Tab` still walks
between the fields of the insert form, the filter, and the pager as it does anywhere else.

- **The grid's frame becomes focusable.** `tabIndex={0}` and an accessible name, so it can hold focus
  and be reached. Its listener stays on `window` — so a key pressed on a row's delete control or a
  foreign-key cell still moves the highlight — and adds the one condition it was missing: the grid
  answers only while focus is inside it.
- **The console's `inputRef` comes from the frame**, the way the agent bar's does, so the frame is the
  one place that knows about both panes and can swap focus between them.
- **`Tab` is claimed bare.** `Shift+Tab` is the host's — it walks out of a plugin tab — and a
  modifier chord is never this key's.

The agent bar's `Tab` completes a word. The SQL bar's does not: there is nothing here to complete a
word *against*, and the entry asks for focus movement instead. Everything else about the bar's keys is
the shared keymap's already — `ArrowUp`/`ArrowDown` walk the recall list, `Enter` sends, `Shift+Enter`
starts a line — and `ArrowRight` accepting a ghost completion is the agent bar's behaviour too, which
is the behaviour being mirrored.

## Implementation steps

1. **`web/src/plugins/sql/SqlConsole.tsx`** — take `inputRef` and `onLeave` as properties; claim a
   bare `Tab` for `onLeave` and hand every other key to the shared keymap.
2. **`web/src/plugins/sql/DataGrid.tsx`** — the scroll frame takes `tabIndex`, an accessible name, and
   an `onEnter` for a bare `Tab`; pass the focusable flag into the selection hook.
3. **`web/src/plugins/sql/selection.tsx`** — the keydown listener answers only while the grid holds
   focus.
4. **`web/src/plugins/sql/SqlTab.tsx`** — hold both refs and the swap between them.

## Tests

- `web/src/plugins/sql/SqlConsole.test.tsx` — a bare `Tab` leaves the bar for the grid; `Shift+Tab`
  does not; every other key still belongs to the bar, and `ArrowUp` in it recalls without the grid
  moving.
- `web/src/plugins/sql/Selection.test.tsx` — the row keys are answered with the grid focused and
  ignored with the command bar focused, which is the whole of the split.
- `web/src/plugins/sql/DataGrid.test.tsx` — the frame is focusable and named, and a `Tab` on it comes
  back to the command bar.
- `web/src/plugins/sql/SqlTab.test.tsx` — the two-pane round trip, in the tab as a user has it.

## Out of scope

- The agent bar's `Tab` completion, which is a different key's job and has no subject in this tab.
- `Shift+Tab`, which the host owns.
- Keybindings inside the grid's own controls — the delete button, a foreign-key cell, the cell editor —
  which keep whatever they had.
- The recall list and its fifty entries, which entry 2 left as the command bar's own.
