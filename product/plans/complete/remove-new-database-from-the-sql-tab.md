# Remove new database functionality from the SQL tab

**Complexity: 2/10** — delete a component's second mode, a boolean parameter, and three test cases; amend one clause in the spec.

## Goal

The tab's database switcher ends in a `New database…` entry that swaps the `<select>` for a text
field, and the `open` intent passes `create: true` so that name makes a database file on disk. A
project's databases belong to the command line — `db sqlite create <name>` is the way one is made,
and the `sql` command already refuses an unknown name for exactly the reason the switcher was
excused from: a name in front of a user is a name that can be a typo.

Making a database is a one-line command with a printed answer. A bare text field in a browser tab is
not. Remove the whole path: the switcher goes back to being a `<select>` over the databases the
registry has, and `open` goes back to refusing a name it has not.

## Approach

Delete the naming state rather than hide it. `DatabaseSwitcher` loses its `New database…` option, its
field, and the `NAMING` sentinel the option carried — with only one option per database left, the
sentinel has nothing to distinguish and the sentinel's own justification ("an empty value cannot be
a database's name") goes with it. The component keeps its `payload`/`onOpen` props, so `SqlTab`'s
call site is untouched.

On the server, `openDatabase` loses its `create` parameter. Both callers passed `false` before the
switcher's field existed, and both pass `false` again, so the branch and the parameter it gated are
dead weight — and the comment explaining "a caller that has a name in front of a user has to choose"
goes with them, because after this there is no such caller. The `UNKNOWN_DATABASE` refusal, and the
fact that `rejectRequest` is followed by a return rather than an else, stay as they are.

The `open` intent keeps its name and its guard: the switcher still sends it, for a database the
registry has. What changes is only what it does with a name the registry has not.

## Implementation steps

1. **`web/src/plugins/sql/DatabaseSwitcher.tsx`** — drop the `NAMING` sentinel, the `naming`/`name`
   state, the `create` handler, the field markup, and the trailing option. What is left is a select
   whose `onChange` calls `onOpen` with the value; the rewrite drops the component's two comments
   with it, since both were about naming.
2. **`web/src/plugins/sql/sql.css`** — remove `.sql-database-new` and its `input` rule, which have no
   markup left to style.
3. **`src/plugins/sql/open-tab.ts`** — remove the `create` parameter, the `!create` in the known
   check, and the parameter's paragraph of the doc comment; state instead that an unknown name is
   refused, since reading a schema opens a connection and that is why the refusal exists.
4. **`src/plugins/sql/activate.ts`** — drop the trailing `false` from both `openDatabase` calls.
5. **`src/plugins/sql/intents.ts`** — drop the trailing `true`/`false` and rewrite the `open`
   comment, which argues for the split between the command and the switcher that no longer exists.
6. **`product/specs/sql-database.md`** — the `sql <name>` paragraph loses the switcher's half of
   "A database is made with `db sqlite create <name>`, or from the tab's own database switcher…",
   leaving the command as the one way. The "What it does not do" list is where a fact like this
   belongs once the spec is not describing it, so the bullet there says the tab reads databases
   rather than making them.

## Tests

- `web/src/plugins/sql/SqlTab.test.tsx` — the switcher case now expects the option list to be
  exactly the databases the registry has, and still expects `open` with the chosen one. The two
  naming cases are deleted with the feature they tested.
- `src/plugins/sql/activate.test.ts` — the case asserting the switcher creates an unknown name is
  inverted: `open` on a name the registry has not heard of is refused with
  `No database named "fresh". Create it with: db sqlite create fresh`, and opens no tab. The comment
  above it goes, since the contrast it draws is gone.
- `web/src/plugins/sql/SqlTab.test.tsx` — a new case that no option in the switcher can start a
  name being typed: the list is the databases and nothing else, which is what pins the removal.

## Out of scope

- `db sqlite create` itself, its output, and the database registry's name rules. Untouched.
- The empty state. A project with no database has no `sql` tab to carry a control that creates one;
  `sql` still reports `No databases. Create one with: db sqlite create <name>`.
