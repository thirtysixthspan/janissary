# Do not create a database from a bare `sql <name>`

**Complexity: 3/10** — one branch in the command, one predicate shared with the intent that *does*
create, and a cross-tab signal. Small, but it touches the one path that creates files.

## Goal

`runCommand` in `src/plugins/sql/activate.ts` validates that a name matches the registry's character
rule and hands it to `openDatabase`, whose first action is a schema read. `DatabaseBrowser.schema`
reaches `getConnection`, and `getConnection` creates the file — so `sql shpo` against a project whose
database is `shop` silently leaves an empty `shpo.sqlite` behind, which then appears in
`db sqlite list` and in the tab's own database switcher forever.

The tab has two genuinely different intentions that one argument currently merges: *show me a database*
and *make a database*. Only the second should create.

## Approach

Split them at the boundary each arrives through, and give `openDatabase` a `create` flag so the two
callers share one body and cannot drift on the schema read, the tab key, the title, or the dock.

The **command** looks a name up and refuses one the registry has never heard of, reusing the message
`db sqlite query` already gives. A command is typed, and a typo in a typed command is the common case;
refusing is the recoverable answer and creating is not.

The **intent** the empty state and the database switcher send is an explicit wish for a database to
exist, so it keeps the creating behavior — and it is already the only thing that sends it, so no extra
payload field or shared predicate is needed to tell the two apart. One flag on one function is the
whole of the distinction.

## Implementation steps

1. **`src/plugins/sql/open-tab.ts`** — add a `create` parameter to `openDatabase`, and when it is
   false, refuse a name the registry's current list does not carry. Export the refusal as a message
   built from the same words `src/database/query.ts` uses.
2. **`src/plugins/sql/activate.ts`** — have `runCommand` pass `create: false` on both of its paths,
   the named one and the current-one.
3. **`src/plugins/sql/intents.ts`** — have the `open` intent pass `create: true`, with a comment
   naming the asymmetry so a later change does not make both paths agree by accident.

## Tests

`src/plugins/sql/activate.test.ts` gains a case that `sql <unknown name>` is rejected with the
guidance and opens nothing, and one that a name the registry knows still opens. The existing case
that `fresh` opens must now go through the intent rather than the command, which is the path the
empty state uses. `src/database/browser.test.ts` is untouched and its case that `create` still
produces a file is the one that would silently stop working if the creating path were broken.

## Out of scope

- Changing `db sqlite create`, `queryDatabase`, or any other part of the command surface. `sql` never
  becomes a second way to create a database; `db sqlite create` is that way.
- Guessing at a near-miss name. Suggesting `shop` for `shpo` is a feature, not a fix.
- Any change to what a name may contain. `dbPath` and the shared guard own that, and both keep it.
