# Leave the statement Run sends in the console

**Complexity: 3/10** — one piece of state lifted to the tab, two prop pairs, two test cases, one
clause in the spec.

## Goal

The drawer's **Run** calls `capabilities.intent('run', { sql: renderRunnableSql(...) })` and nothing
else, so the statement runs and the console stays empty. The plan this branch shipped says **Run**
"puts the statement in the console and sends it, so a filtered grid becomes the starting point of a
hand-written query" — and the empty console is the half a user wanted: the point of pressing Run is
to get the query somewhere they can adjust it, not to watch it execute again.

`SqlConsole` holds its text in local state, so the drawer had no way to put anything there. The
value has to be somewhere both can reach.

## Approach

Lift the console's text to `SqlTab`, which already owns the frame both live in, and pass it down as a
controlled value. **Run** then sets that value and sends the same statement, in one handler, so the
text on screen and the text that ran are the same string by construction rather than by agreement
between two call sites.

The console's own history stays where it is: it is the last fifty statements typed at that prompt,
and a statement run from the drawer was not typed there.

## Implementation steps

1. **`web/src/plugins/sql/SqlConsole.tsx`** — take `value` and `onValue` as props instead of owning
   the text, and say in the file's comment that the frame owns the value so the drawer's **Run** can
   put a statement in the console as well as send it.
2. **`web/src/plugins/sql/SqlTab.tsx`** — hold the console's text, pass it to `SqlConsole`, and take
   an `onRun` that sets the text and sends the statement; pass that to `SqlDrawer`.
3. **`web/src/plugins/sql/SqlDrawer.tsx`** — call `onRun` with the rendered statement instead of
   sending the intent itself.

## Tests

- `web/src/plugins/sql/SqlTab.test.tsx` — pressing **Run** with a filtered grid leaves the rendered
  statement in the console and sends it; the console still sends what is typed into it.
- `web/src/plugins/sql/SqlDrawer.test.tsx` — the existing "asks to run the statement with its values
  filled in" case follows `onRun` rather than reaching for the capability.

`product/specs/sql-database.md` already says **Run** "sends the statement *with those values written
in*"; add that the console is left holding it, which is the part that was missing.
