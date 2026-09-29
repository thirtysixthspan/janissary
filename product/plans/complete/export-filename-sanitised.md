# Sanitise the object name in the export filename

**Complexity: 2/10** — one pure helper, one call site, and a test case. No new module, no new
dependency, and no change to any behavior a correct name already had.

## Goal

`nextExportName` in `src/database/export.ts` builds a candidate filename from the selected object's
name, and that name is read straight out of `sqlite_schema`. A table can be called anything SQLite
accepts, including `../../../../tmp/pwned`, and `hasObject` — the only check the object name passes —
asks whether the object *exists*, not whether its name is safe in a path. So `path.join` in
`exportRows` resolves the export outside `.janissary/db/exports/`, and the server writes a file at a
path nobody chose.

The fix is a name that cannot traverse: reduce the object name to characters that are safe in a
filename before it reaches a path.

## Approach

Add a `safeFileName(name)` helper beside `nextExportName` and build the candidate from it. The rule
is deliberately conservative rather than clever — replace every character outside `[A-Za-z0-9._-]`
with `-`, collapse nothing, and refuse a name that reduces to an empty or dot-only string, since
such a candidate has no stem to number.

`hasObject` keeps answering the question it was written for. Folding a filename rule into it would
make "does this object exist" and "is this name safe in a path" one function, and they diverge: an
index is a perfectly good name that is not a browsable grid, and a safe-looking name may still not
exist.

## Implementation steps

1. **`src/database/export.ts`** — add and export `safeFileName(name)`: replace every character
   outside `[A-Za-z0-9._-]` with `-`, then return `null` when the result holds no alphanumeric
   character, which covers `..`, `.`, and the empty string. Have `nextExportName` build its candidate
   from `safeFileName(object)`, and return the refusal from `exportRows` as
   `Cannot export "<object>": the name has no characters a filename can carry.` when it is `null`.
   The database name comes from the same validated rule `dbPath` enforces and is left alone.
2. **`src/database/export.test.ts`** — cover a name carrying a traversal and a separator, a name that
   reduces to nothing, two exports of the same awkward object getting distinct numbers, and the
   reported name matching the file that was written. The existing cases for ordinary names must pass
   unchanged, which is the check that the rule is a no-op for a name that was never a problem.

## Tests

`src/database/export.test.ts` gains a `safeFileName` describe and two export cases. The helper's own
cases: a plain name is unchanged, a name with a traversal and a separator reduces to dashes, `..` and
`.` and the empty string are refused, and a name that reduces to only dashes is refused. The export
cases: a table named `../../escape` writes a file that is inside the export directory, a second
export of it gets the next number rather than overwriting the first, and the `name` in the result is
the file that exists on disk.

## Out of scope

- Restricting what an object may be *called*. A table with an awkward name is a legitimate table;
  the grid browses it, the console queries it, and only the file it is exported to is renamed.
- Any change to `hasObject`, the streaming writer, the row ceiling, or the grid's own SQL.
- Cleaning up files an earlier version already wrote outside the export directory. The fix is
  forward-looking; nothing in this repository has shipped a release that could have done it.
