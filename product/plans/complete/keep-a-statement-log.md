# Keep a log of the statements the tab has run

**Complexity: 2/10** — one field replacing one field, one prepend, one list in a drawer that already
exists. The design question is whether the newest entry is a separate field, and it is not.

## Goal

The tab reports only the most recent statement, so a user who made three edits in a table and wants
to know what happened has nothing to read. This browser is the only surface in the application that
mutates data, so it is the only place a record of what was written could live.

DB Browser for SQLite lists "Examine a log of all SQL commands issued by the application" among its
headline capabilities and logs each one with its outcome.

## Approach

`console: SqlConsoleResult | null` becomes `log: SqlConsoleResult[]`, newest first, capped at fifty.

The console's own line under the prompt reported the last statement, and it now reads `log[0]`. That
is the whole design decision: one list means the line and the history cannot drift apart, and two
fields holding "the last one" and "all of them" is one field too many.

**A failed statement is an entry too.** A log of successes answers "what worked", which is not the
question a user asks after something went wrong.

The cap is a cap rather than a full history because the log lives in the tab payload, which is
broadcast on every update — an unbounded list would make each keystroke in the console resend every
statement the tab has ever run.

**Clear log** issues no request. A log is a record of what already ran, so discarding it changes
nothing about the rows on screen.

## Implementation steps

1. **`src/plugins/sql/tabs.ts`** — `MAX_LOG` beside `MAX_EXPORTS`, and `addToLog` beside `addExport`.
2. **`src/plugins/sql/shared.ts`** — the field and its guard.
3. **`src/plugins/sql/fold.ts`** — prepend on a write, on the failure path as well as the success one.
4. **`src/plugins/sql/shared-intents.ts`**, **`src/plugins/sql/intents.ts`** — `clear-log`, empty
   payload, like refresh.
5. **`web/src/plugins/sql/SqlLog.tsx`** — new: the list and its per-entry copy.
6. **`web/src/plugins/sql/SqlDrawer.tsx`** — the history above the current statement, and the console
   line in `SqlTab.tsx` reading `log[0]`.

## Notes from the build

- The drawer has to work with no statement of its own to show. A tab that has written something but
  has not filtered anything has a log and no grid statement, so the history is not gated on the
  statement being present.
- A copy control names the statement it copied rather than a position, so two runs of the same
  statement are correctly the same control and a numbered "3" says nothing about which entry it is.

## Tests

`src/plugins/sql/activate.test.ts` covers the order, the failed statement, the cap and the eviction
past it, and the clear issuing nothing. `src/plugins/sql/shared.test.ts` covers both guards.
`web/src/plugins/sql/SqlDrawer.test.tsx` covers the list, the outcome each entry reports, the
per-entry copy, the copied confirmation, the clear, an empty log, and a log with no statement above
it.

## Out of scope

- Logging reads. The grid already shows the statement that produced it, and a list of every query the
  tab has made would bury the writes that are the reason to keep a log.
- Exporting the log to a file.
- Grouping repeats of the same statement into a count.
