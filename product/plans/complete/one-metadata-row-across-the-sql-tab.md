# One metadata row across the tab, and no statistics, SQL or copy controls

**Complexity: 6/10** — a new table switcher, a new metadata row, four components deleted, and the statistics read removed from the protocol, the topic, the browser, the payload and the spec.

## Goal

The tab has three places to look for the same three facts. The header carries the database and the
**Stats** control; the grid's own bar carries the object's name, the row controls, **Insert row**,
**Copy selection**, **Columns** and the exports; and the console carries a history control. A docked
tab adds a fourth — a **Schema** / **Data** switch, which exists only because there are two panes.

A harness tab has one metadata row across the full width, the facts on the left, the actions on the
right, and one body below. That is the shape this tab should have: one row that answers "which
database, which table", and one row of actions beside it.

Three of the actions do not belong there at all. **Stats** asks the database for a per-column
distribution of the selected object, which the console can do in a statement if anyone wants one.
**Copy** duplicates the platform's own copy key, which the selection answers to today. The **SQL**
panel is already gone. All three go, and so does the read behind **Stats** — it is a topic action, a
protocol result, a browser method and a payload part, and leaving any of it would be backing
functionality for a control that no longer exists.

## Approach

**One row.** The tab becomes a metadata row and a body. The row is the plugin's own flex header with
a bottom border and its actions pushed right — the `.tab-meta` shape a harness tab draws, rebuilt
with the plugin's class names because a client plugin may reach only its own stylesheet and the
shared plugin one. `.sql-body` loses the pane beside it, so the docked **Schema** / **Data** switch
loses its second member and goes with it.

**The table dropdown replaces the navigator.** A `<select>` beside the database one, grouped by kind
with `<optgroup>`, exactly the groups the navigator drew: tables, then views, indexes and triggers. A
trigger is `disabled` in the list, which is the same answer the navigator gave in words. It is
reloaded by choosing a database, and it needs nothing to do that: `open` opens a tab whose payload
carries the new database's objects, and the server reads that schema before the tab is shown. What
the navigator knew that a select cannot show — a column count beside each name — goes with it, since
the grid's own bar already names the object it is showing.

**The grid's bar loses the actions and keeps the facts.** The object name, the range, the read-only
reason, and the filter row stay. **Insert row**, **Columns**, the exports and the split move up into
the metadata row, where every other tab keeps its actions.

**Copy keeps its key.** The button goes, because the application already has a copy key and this tab's
selection answers to it — the row a user selects is still copied, which is what the selection is for.
What goes with the button is the `copy` function it called; the window listener that writes the
selection on the platform's copy chord is not that button's backing, it is the shortcut.

**The statistics read goes end to end**: `columnStats` and its file, `browser.stats`,
`manager.browseStats`, the topic's `stats` case, the topic action and the `stats` result in the
protocol, `SqlStatsColumn` and the payload's `stats` part, the `stats` intent, its guard, the plan,
the fold branch, `StatsPanel` and `barScale`, and the spec's section. The payload contract is at
version 1 and a tab restored from a profile saved before this will still carry a `stats` part, so the
guard keeps accepting and ignoring it rather than refusing the whole payload.

`planRequest` also loses its `create` branch, which nothing has called since the tab stopped creating
databases and which exists only for that.

## Implementation steps

1. **`web/src/plugins/sql/TableSwitcher.tsx`** — new: the object dropdown, grouped by kind, with the
   selected one marked and a trigger disabled.
2. **`web/src/plugins/sql/SqlTab.tsx`** — the metadata row with the database dropdown, the table
   dropdown, the object actions and the export links; the body is the grid alone; the frame holds
   which of the two forms is open; the **Stats** control, the drawer state and the **Schema** / **Data**
   switch go.
3. **`web/src/plugins/sql/DataGrid.tsx`** — its action bar becomes the object name, the range and the
   read-only reason; the two form flags arrive as props that default closed, which is what a grid with
   no row above it looks like.
4. **`web/src/plugins/sql/SchemaNavigator.tsx`** and its test — deleted with `groupedObjects`,
   `browsable` and `columnCount`, which nothing else reads.
5. **`web/src/plugins/sql/StatsPanel.tsx`**, its test and `barScale` — deleted.
6. **`web/src/plugins/sql/selection.tsx`** — `CopySelectionButton` and the `copy` it called are gone;
   the window listener that answers the platform's copy chord stays.
7. **`web/src/plugins/sql/shared.ts`** — `SqlStatsColumn` and the payload's `stats` part go; the guard
   accepts a `stats` part and ignores it, for a tab restored from an older profile.
8. **`src/plugins/sql/intents.ts`**, **`shared-intents.ts`**, **`request.ts`**, **`fold.ts`**,
   **`tabs.ts`** — the `stats` intent, guard, plan, follow-up and fold branch go, and with them the
   `create` plan branch.
9. **`src/database/stats.ts`** — deleted; **`browser.ts`**, **`manager.ts`**, **`src/plugins/topics.ts`**,
   **`src/plugins/api-topics.ts`**, **`src/protocol/database.ts`**, **`src/plugins/api.ts`**,
   **`src/protocol.ts`** — the `stats` action, result, view type and their exports go.
10. **`web/src/plugins/sql/sql.css`** — the header, the navigator and the statistics panel's rules go;
    the metadata row's and the switcher's arrive.
11. **Tests** — the server's statistics cases, the navigator's, the panel's, and the client's header
    and docked cases are deleted or rewritten with the cases below.
12. **`product/specs/sql-database.md`** — the statistics section goes; "What the tab shows" describes
    the one metadata row and what is in it; the docked paragraph loses the switch.

## Tests

- `web/src/plugins/sql/TableSwitcher.test.tsx` — every object is offered, grouped by kind in the order
  the schema declares; the selected one is the dropdown's value; a trigger is offered but not
  selectable; changing it sends `select-object`; a database's objects replace the previous ones when
  the payload changes.
- `web/src/plugins/sql/SqlTab.test.tsx` — one metadata row carries the database dropdown, the table
  dropdown, **Insert row**, **Columns**, **CSV**, **JSON**, the export links and the split control,
  and no **Stats**, **Copy selection** or **SQL** control exists anywhere; a docked tab shows the
  same row and no view switch; the insert form and the column chooser open from the row.
- `web/src/plugins/sql/Selection.test.tsx` — a selected row is still copied by the platform's copy
  key, and the tab offers no copy control at all.
- `web/src/plugins/sql/sql-style.test.ts` — the metadata row is a band with its actions at the right
  end, the grid takes the height between it and the bar, and no rule survives for a control the tab
  no longer has.
- `src/plugins/sql/activate.test.ts` — the `stats` intent is an unknown intent; a payload carrying a
  `stats` part is still a payload.
- `src/plugins/sql/shared.test.ts` — the same guard case, at the contract.

## Out of scope

- The column count beside each object in the navigator. A `<select>` has nowhere to put it, and the
  grid's bar already names the object on screen.
- Whether the metadata row is a plugin frame or a bespoke one. A harness tab's row is a host
  component; a plugin cannot reach it, so the row is rebuilt with the plugin's own classes.
