# Let the tab's database switcher name a database that does not exist

**Complexity: 3/10** — one new component, one prop chain, three test cases, one clause in the spec.

## Goal

The header's switcher is a `<select>` over `payload.databases`, so `event.target.value` can only ever
be a name the registry already has and the `open` intent's create branch is unreachable from the
client. The spec says "A database is made with `db sqlite create <name>`, or from the tab's own
database switcher, which does create it", and `open`'s own comment names "the switcher and the empty
state's control" — there is no empty state's control either, because a project with no database has
no tab to carry one.

The server is already right: `openDatabase(name, dock, capabilities, tabs, true)` creates, and the
comment beside it says why — "a caller that has a name in front of a user has to choose; a caller
that already knows the database exists does not." A name typed into a field is a caller with a name
in front of a user. What is missing is the field.

## Approach

Give the switcher a way to be a field. A `New database…` option at the end of the list swaps the
select for a text field with a Create control; Enter or Create emits `open` with what was typed and
Escape puts the select back. The name is sent as typed — the server already answers an invalid one
with `Invalid database name "<name>".`, which is the message a user wants, and pre-validating it
here would only say it earlier in a different place.

The switcher becomes its own component, since it now holds state and the frame it sits in is
already carrying the navigator, the grid, the drawers and the console.

## Implementation steps

1. **`web/src/plugins/sql/DatabaseSwitcher.tsx`** — a new component holding the naming state: the
   select as it is today, plus a `New database…` option; choosing it shows a text field labelled `New
   database` with a Create control, where Enter creates, Escape puts the select back, and a blank
   name is not offered. `SqlPayload` and an `onOpen(name)` prop, so the frame keeps the capability.
2. **`web/src/plugins/sql/SqlTab.tsx`** — draw `DatabaseSwitcher` in place of the inline select and
   pass `onOpen`, so both routes to `open` — a listed name and a typed one — go through `send` as they
   do now.
3. **`src/plugins/sql/intents.ts`** — the `open` comment names an empty state's control that does not
   exist; say the switcher is what sends this, in both its forms.
4. **`web/src/plugins/sql/sql.css`** — the field and its Create control beside the select.

## Tests

- `web/src/plugins/sql/SqlTab.test.tsx` — the existing case that changing the switcher emits `open`
  with the listed name stays; a new case chooses `New database…`, types a name and presses Enter and
  finds `open` emitted with it, and one that Escape puts the select back and emits nothing.
