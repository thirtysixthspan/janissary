# Give the grid's LIKE an escape character

**Complexity: 3/10** — one clause in one module, and a test that runs the statement rather than
inspecting the string it is handed.

## Goal

`likeValue` in `src/database/grid-sql.ts` backslash-escapes a `%` or `_` inside the value it is
given, so a search for the literal text `50%` produces the pattern `%50\%%`. SQLite's `LIKE` has no
default escape character, so that backslash is just another character to match: the pattern asks for
a value containing a literal backslash after `50`, and no such value exists. Every term holding a
percent or an underscore therefore matches nothing — in the per-column `contains` filter and in the
all-column term alike, since both go through the same helper.

`product/specs/sql-database.md` states that `contains` "escapes any `%` or `_` the value itself
contains", which is the behaviour intended and not the behaviour shipped.

## Approach

Name the escape character in the statement. `ESCAPE '\'` tells SQLite to read the backslashes
`likeValue` already inserts as escapes, which is what they were written as. No change to the value
building is needed, and the count of bound values is unchanged.

## Implementation steps

1. **`src/database/grid-sql.ts`** — append ` ESCAPE '\'` to the `LIKE` that `fragmentFor` emits for
   `contains`, and to every `LIKE` in the group `globalFragment` builds. `globalFragment` composes
   one clause per column from a single template, so one edit covers the whole term. Both statements
   are bound-parameter statements already; the clause adds no interpolated input.
2. Update the module's comment on `likeValue` to say why the escape character is named in the
   statement, so the next reader does not remove one of the two halves.

## Tests

- `src/database/grid.test.ts` — keep the case asserting the escaped bound value, and add one that
  prepares the clause `whereClause` produces against a real `node:sqlite` database holding rows
  `50%_off` and `50x_off`, asserting the first comes back and the second does not. The file already
  opens real databases for its `runGrid` cases, so follow that style. Assert the same for the
  all-column term through `whereClause(query, COLUMNS)` with a global value, since it takes a
  different path into the same helper.

`product/specs/sql-database.md` needs no change — the fix makes the code match what it already says.
