# Remove the statement history panel from the SQL tab

**Complexity: 3/10** — a panel, the state and keys behind it, one intent, and their styles; no
contract change and no new architecture.

## Goal

The SQL tab carries a history panel beside its command bar: a button that opens a list of every
statement the tab has run, each with what it changed or the error that stopped it, and a **Clear log**
to empty it.

The command bar is the only way to inspect the command history. It already recalls the last fifty
statements typed in the tab with `ArrowUp` and `ArrowDown`, through the host's own keymap, and that is
enough — the panel is a second surface for the same list, with its own selection to keep in step and
its own key handling to keep out of the line's way.

The console is left as the command bar and nothing else.

## Approach

The panel and everything that existed only to serve it go. What it read from stays, because something
else reads it:

- **Goes:** `SqlHistory.tsx` and its test; the `.sql-history-toggle` button in `SqlConsole.tsx`; the
  `open` and `picked` state, `toggle`, `pick`, and the modal `onKeyDown` that bypassed the shared
  keymap while the panel was open; the `log` and `onClearLog` properties; the `.sql-history*` rules
  and the `.sql-console-bar` flex wrapper that existed to place the button beside the line; the
  `clear-log` intent on both sides, its guard, and its tests.
- **Stays:** `payload.log` and the server that fills it. The line under the prompt reports the newest
  entry's outcome, and moving that line to a notification is a separate piece of work.

`logOutcome` is the one function the panel and that line shared. The line is its only remaining
caller, so it moves to a module of its own — a pure sentence builder beside the component that shows
it, rather than a component-local function.

`nextHistoryRow` and `isHistoryKey` are written out adaptations of the shared list-selection rule for
a client plugin that may reach only its own api. With no panel, nothing needs them.

## Implementation steps

1. **`web/src/plugins/sql/console-result.ts`** — new, holding `logOutcome` alone.
2. **`web/src/plugins/sql/SqlHistory.tsx`** and **`SqlHistory.test.tsx`** — deleted.
3. **`web/src/plugins/sql/SqlConsole.tsx`** — drop the button, the panel state, the modal key
   handling, the `log` and `onClearLog` properties, the `above` slot, the `CommandBarShell` import
   and the icon import; render the bar on its own.
4. **`web/src/plugins/sql/SqlTab.tsx`** — stop passing `log` and `onClearLog`; import `logOutcome`
   from `./console-result`.
5. **`web/src/plugins/sql/sql.css`** — drop the `.sql-history*` rules and the `.sql-console-bar`
   rules.
6. **`src/plugins/sql/intents.ts`**, **`src/plugins/sql/shared-intents.ts`** — drop the `clear-log`
   handler and its guard and type.
7. **`src/plugins/sql/activate.test.ts`**, **`src/plugins/sql/shared.test.ts`** — drop the
   `clear-log` cases.
8. **`product/specs/sql-database.md`** — the **Statement history** section becomes the command bar's
   own recall, and the three other passages that send the reader to the panel say the same.

## Tests

- **`web/src/plugins/sql/SqlConsole.test.tsx`** — new, carrying the two console cases that lived in
  the deleted test file, and covering that there is no history control beside the bar, that
  `ArrowUp` still walks back through what was typed, and that `Enter` sends whatever is in the line
  with no panel to intercept it.
- **`web/src/plugins/sql/console-result.test.ts`** — new: a failure, `OK.`, one row, many rows.
- **`web/src/plugins/sql/sql-style.test.ts`** — `.sql-history` joins the list of controls the
  stylesheet must carry no rule for.
- **`src/plugins/sql/activate.test.ts`** — the `clear-log` case goes; the cases that a write lands on
  `log` stay, because the line under the prompt still reads it.
- **`src/plugins/sql/shared.test.ts`** — the `isClearLogIntent` cases go.

## Out of scope

- The log itself, and the line under the prompt that reports the newest entry. Reporting a result
  somewhere other than the tab is a separate change.
- `CommandBarShell` and its `above` slot, which the agent bar's completion strip uses.
- The console's own recall list and its fifty-entry cap. That is the command bar, and it is what
  remains.
