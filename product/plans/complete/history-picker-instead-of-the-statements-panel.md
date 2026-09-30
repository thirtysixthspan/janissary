# Replace the statements panel with a history picker, and prompt the command bar `SQL >`

**Complexity: 5/10** — two components deleted, two added, one pure key rule, the tab frame's header simplified, the console's prompt labelled.

## Goal

The tab's **SQL** control opens a panel holding the statement that produced the grid with `?` where a
value was bound, its parameters as JSON, a **Copy** and a **Run**, and above them a list of the
statements the tab has run. It is a second command surface: a place to send SQL that is not the
command bar, and a place to read the grid's query that the command bar cannot show.

The agent tab has already solved the second half. Its `hist` picker is a small panel over the command
line listing what has been run, with the same selection keys everywhere in the application, and a
picked row goes back into the line rather than executing on the spot. The SQL tab should answer its
own history the same way, and the command bar should be the only place SQL is entered — labelled, so
that a line reading `>` in a tab full of grids is not mistaken for the application's own command line.

## Approach

**The drawer goes.** `SqlDrawer.tsx` and `SqlLog.tsx` are deleted along with the header's **SQL**
button, and with them the `renderRunnableSql` helper, whose only caller was the drawer's **Run**. So
the generated statement is no longer shown and no longer re-runnable, which is the point: it was a
second way in, and the grid's own query was never the thing a user was looking for.

**The history replaces it.** A new `SqlHistory.tsx` draws the log in the shape of the agent tab's
history picker: a titled panel, one row per statement newest first, `(no history)` when there is
none, the selected row marked, and a **Clear log**. It opens over the command line through the
`CommandBarShell`'s own `above` slot — the same slot the agent bar's completion strip uses — so it
sits where a picker in that application sits rather than where a drawer did.

The keys are the picker's: `ArrowUp` and `ArrowDown` move the selected row and stop at the ends,
`Enter` sends the selected statement and closes, `Escape` closes, and a clicked row does the same as
`Enter`. While the panel is open they belong to the panel, which is what "the picker is modal" means
in the agent bar too, so the console's own key handler is not consulted for them. The movement rule
is a pure function beside the component, so it is testable without a render.

**The prompt is labelled.** `CommandBarShell` already renders a `label` before its chevron — the
agent bar puts `queue` there — so `SQL` in that slot is the whole of the change, and it is the
published surface rather than a fork of the bar.

The result line under the prompt stays where it is for this entry: it is what the newest statement
did, and entry 10 is what decides where a *failure* is reported. The history is now the other place
the same outcome is written down, which is the duplication the agent bar does not have.

## Implementation steps

1. **`web/src/plugins/sql/SqlHistory.tsx`** — new: the panel, and `nextHistoryRow` and `isHistoryKey`
   for the selection rule beside it, written the way `sql-keys.ts` carries the grid's.
2. **`web/src/plugins/sql/SqlConsole.tsx`** — owns whether the panel is open; renders it through the
   shell's `above` slot beside a history control; takes the picker's keys before the baseline's while
   it is open; labels the prompt `SQL`.
3. **`web/src/plugins/sql/SqlTab.tsx`** — the **SQL** button, the `faCode` glyph, the `drawer === 'sql'`
   branch, the `run` callback that fed it, and the `onRun` prop go; only the stats drawer is left for
   entry 9 to remove.
4. **`web/src/plugins/sql/grid-view.ts`** — `renderRunnableSql` and `sqlLiteral` go with their only
   caller.
5. **`web/src/plugins/sql/sql.css`** — the drawer's and the log's rules are replaced by the panel's.
6. **`web/src/plugins/sql/SqlDrawer.test.tsx`** — deleted with the component; its history cases become
   `web/src/plugins/sql/SqlHistory.test.tsx`, and its statement cases go because the statement is no
   longer shown.
7. **`web/src/plugins/sql/SqlTab.test.tsx`** — the generated-SQL case and the drawer's-Run case go,
   and a case asserts the header offers no **SQL** control and the prompt reads `SQL`.
8. **`web/src/plugins/sql/grid-view.test.ts`** — the `renderRunnableSql` cases go with it.
9. **`product/specs/sql-database.md`** — the "generated SQL" section becomes the history panel; the
   console section says the command bar is the only way SQL is entered and that its prompt reads
   `SQL >`; the export section's CSV/JSON and the statistics section are untouched, since entry 9
   removes those.

## Tests

- `web/src/plugins/sql/SqlHistory.test.tsx` — every statement the tab has run, newest first, each with
  what it did; `(no history)` on a tab that has run nothing; **Clear log** emits `clear-log`; a
  clicked row and `Enter` both send that statement and close the panel; `ArrowUp`/`ArrowDown` move the
  selection and stop at the ends; `Escape` closes and sends nothing; the console's own Enter does not
  fire while the panel is open.
- `web/src/plugins/sql/SqlHistory.test.tsx` — the panel opens from a history control and shows the
  prompt labelled `SQL`.
- `web/src/plugins/sql/SqlTab.test.tsx` — the header no longer offers a **SQL** control.

## Out of scope

- Where a *failure* is reported. The result line under the prompt stays, and the log keeps listing a
  failed statement; the next entry moves failures to notifications and this one must not anticipate it.
- The log's **Copy** per entry. A picked row now goes into the command line, which is what the agent
  tab's picker does, and the line can be copied from there.
