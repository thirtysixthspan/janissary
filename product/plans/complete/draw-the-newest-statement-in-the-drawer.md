# Draw the newest statement in the SQL drawer too

**Complexity: 2/10** — one slice off one array, one label, three test cases, one clause in the spec.

## Goal

`SqlDrawer` takes `payload.log.slice(1)` as the list it draws, and `SqlTab` renders `payload.log[0]`
under the prompt as its outcome alone. So the statement the tab has just run is in neither: the list
starts at the second-newest, and the line carries `OK.` or the error without the statement that
produced it. A user who clears the log, runs one statement and opens the drawer finds an empty list
where the spec promises "the statements the tab has run — newest first … each with its own **Copy**".

## Approach

Draw the whole log. The list then holds every statement including the newest, with its outcome and
its Copy, and the line under the prompt keeps reporting the newest entry's outcome — which is the
feedback a user wants without opening anything, and which stays the same number either way because
both read one list.

The heading above the list said `Earlier statements`, which was true while the newest was elsewhere
and is not true now, so it names what the list is: the statements this tab has run.

## Implementation steps

1. **`web/src/plugins/sql/SqlDrawer.tsx`** — pass `payload.log` rather than `payload.log.slice(1)` to
   `LogHistory`, in both the branch that has a statement to show and the branch that has only the
   log, and say in the file's comment that the newest entry is listed as well as reported, so a
   statement the tab has run is somewhere a user can read and copy it.
2. **`web/src/plugins/sql/SqlLog.tsx`** — name the heading for what the list now holds, and say in the
   file's comment that the newest entry is here too.

## Tests

- `web/src/plugins/sql/SqlDrawer.test.tsx` — the "shows every statement before the current one" case
  now expects the newest entry in the list as well, still newest first; a new case draws a log
  holding one statement and finds it in the list; the empty-log case follows the renamed heading.
- `web/src/plugins/sql/SqlTab.test.tsx` — the console line still reports the newest entry's outcome
  beside the tab that ran it.
