# Report a SQL failure as a notification rather than under the prompt

**Complexity: 3/10** — one declared capability, one call in the answer path, one gate on the result line, four test cases.

## Goal

A statement that fails writes its SQLite error into the tab's own history and into the line under
the command bar. The history is right: it is a record of what ran, and a record of only the successes
would not say what happened. The line is not. It is a line of a *different* thing — the outcome of
the last statement — and it is the least durable place in the tab: a notification, a keypress, or
anything else the user does puts something else there, and the failure is then nowhere on screen.

A failure is the one result of a statement that the user was not asking for and cannot predict, and
it is the one result that arrives whether or not this tab is on screen. That is what a notification is
for.

## Approach

Declare `notifyUser` in the manifest and report a new failure once, from the place that already knows
one arrived: `deliver`, after the answer is folded. "New" is the whole of it — the payload's previous
`error` is compared with the new one, so a refresh that fails the same way twice says it once, and a
second press of a query that clears the error first says it again.

The console's line then reports only what succeeded, using the outcome rule the history already has
rather than a second one. A failure leaves the line empty, and the notification is where it is said.

The grid's error band stays. It is not the command bar: it sits against the view that failed, it is
what says `Database "<name>" does not exist. Create it to start.` when a database is deleted under an
open tab, and it is what stops the grid drawing `No rows.` for a query that never ran. Moving the
message to a notification as well would leave the grid claiming a table is empty because a read
failed, which is the one thing a grid must not do.

## Implementation steps

1. **`src/plugins/sql/manifest.ts`** — `notifyUser` in the declared capabilities.
2. **`src/plugins/sql/activate.ts`** — after folding, a failure that is not the one already on screen
   is reported once.
3. **`web/src/plugins/sql/SqlTab.tsx`** — the result line reports the outcome of a statement that
   worked, and says nothing about one that did not.
4. **`product/specs/sql-database.md`** — the console's section says a failure is a notification and
   not a line under the prompt; the error band's own claim is stated once so both are accounted for.

## Tests

- `src/plugins/sql/activate.test.ts` — a query that fails reports the message through `notifyUser`; a
  second identical failure without an intervening success does not report it again; a write that
  fails reports it too; a read that succeeds reports nothing.
- `web/src/plugins/sql/SqlTab.test.tsx` — the result line reports a statement that worked and is
  empty for one that did not, and the failure is not printed anywhere in the tab's own chrome.
