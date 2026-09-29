# Name the two browser modules for what they hold

**Complexity: 1/10** — two file renames and their import paths. No behavior change, and the existing
cases are the check that there is none.

## Goal

The tree carries `src/database/browser.ts` and `src/database/browser-service.ts`, and the second
imports the first, so the pair is distinguishable only by a `-service` suffix and by which one exports
the class. The suffix convention is new to this tree — `src/database/index.ts` is the command
dispatcher — and a reader reaching for the wrong one finds out only where a request id or a result
list was expected.

## Approach

Give the qualifier to the state and leave the plain name to the class's own module, which is the
convention the rest of the tree already follows: a manager is plainly named and the state it owns
carries the qualifier, as `DatabaseManager` sits beside the modules it composes.

The state module keeps `DatabaseBrowserState` and `databaseRefs`; the service module keeps
`DatabaseBrowser`. Nothing moves between them — only the names change.

## Implementation steps

1. **`src/database/browser-service.ts` → `src/database/browser.ts`**, and
   **`src/database/browser.ts` → `src/database/browser-state.ts`**. Move the first before the second so
   no moment has two files claiming one name.
2. **`src/plugins/sql/…` is untouched** — it never imported either. Update only the two importers:
   `src/database/manager.ts`, which composes the service, and `src/database/browser.test.ts`.
3. The test's import of `DatabaseBrowserState` and `RESULT_LIMIT` follows the state module; its import
   of `DatabaseBrowser` follows the class's own.

## Tests

No new cases. Every case in `src/database/browser.test.ts` must pass unchanged against the renamed
modules, which is the check that the move was mechanical — a rename that changed an import path's
target would fail there rather than in review.

## Out of scope

- Merging the two modules. They hold different things — one is a value the other consults — and
  folding them together would put a `class` and a `Map` in one file for no gain.
- Renaming `DatabaseBrowser` itself. It is the accurate name for what the class does, and the file it
  lives in is what was ambiguous.
- Any other module in `src/database/`. Only the pair that cannot be told apart is touched.
