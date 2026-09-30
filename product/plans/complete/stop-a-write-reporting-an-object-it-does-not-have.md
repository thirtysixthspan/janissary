# Stop a console write on an objectless tab from reporting `" is not in "<database>".`

**Complexity: 3/10** — one conditional in the fold that plans what a write is followed by, plus the
cases that pin it. No new module, no new capability, no spec change beyond a sentence.

## Goal

Running a statement in a database tab's SQL console that succeeds, on a tab that has no object
selected, leaves the grid's error band reading `"" is not in "shop".` while the line under the prompt
reads `OK.` The band is wrong: the write landed, and the read that produced the message was the
re-read the write triggers, issued for the empty object name the tab is holding.

## Approach

`fold` in `src/plugins/sql/fold.ts` answers a `write` with a follow-up: `planRequest('query', written)`,
because "a write invalidates the page it changed, so the grid is re-read rather than patched". That is
right when the tab is showing an object, and meaningless when it is showing none — there is no page
to re-read, and `payload.object` is `''`.

`gridQueryOf` in `src/plugins/sql/request.ts` builds the action from `payload.object` without checking
it, and `DatabaseBrowser.query` in `src/database/browser.ts` reaches `handleFor`, whose `hasObject`
check fails for `''` and returns `"\"\" is not in \"shop\"."`. The fold puts that in the payload as the
grid's error, which is where the band reads it from.

So the fix is at the one place that knows why the follow-up exists: when a write answers and the tab
has no object, there is no page to re-read, so the write settles. Nothing else changes — the statement
still runs, `OK.` still appears, and the navigator still only refreshes on **Refresh**, which
`product/specs/sql-database.md` states as the rule.

A `schema` follow-up here would be the more useful answer — a console `CREATE TABLE` is the documented
way a table appears, and re-reading would show it — but that changes documented behaviour, and
changing it is not what this entry is about.

## Implementation steps

1. `src/plugins/sql/fold.ts`, the `'write'` branch of `fold`: return `settled(written)` when
   `base.object` is empty, and the existing `planRequest('query', written)` follow-up otherwise.
2. `product/specs/sql-database.md`, **The console**: one sentence saying that a statement which
   succeeds on a tab with no object selected says `OK.` and adds no error, because there is no page to
   re-read.

## Tests

- `src/plugins/sql/activate.test.ts`, beside the existing write-intent cases: a `run` intent answered
  against a payload whose `object` is `''` folds to `error: null` with no follow-up, and the same
  intent against a payload that names an object still re-queries it. The second case is already
  covered by the existing write cases and is the guard against this change breaking the normal path.

## What was checked and left alone

- The `'query'` branch's own `missing(...)` handling, which drops the grid for a database that is gone,
  is a different rule and is not touched: here the database exists and only the object name is empty.
- `DatabaseBrowser.query` refusing an object the database does not have is correct and stays: it is
  what protects a read naming a table that was dropped.
- The console result line, the statement log and the notification are all produced before the follow-up
  is planned, so none of them change.
