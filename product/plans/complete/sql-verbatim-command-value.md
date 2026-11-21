# Restore the verbatim value grammar in `sql file` / `sql database`

**Complexity: 2/10** — ~4 added lines in 1 production file, 3 behavioral requirements, 4 new test scenarios (p=3.80).

## Goal

Restore the `sql [file <path>|database <name>]` grammar defined by subplan 3 (`./product/plans/complete/sql-path-3-command-grammar.md`): after a lower-case keyword, the value is the trimmed remainder taken verbatim, with no trailing dock-word special-case. A real SQLite file whose path ends in a space-separated `left` or `right` must open; a database name ending that way must reach the normal name guard. Only a missing (empty) value is refused with the usage line.

## Design decisions and dependencies

Subplan 3's binding design decisions say the value is "the remainder after that run, trimmed at the ends, as the value", "taken verbatim", "there is no trailing dock word to separate", and that arguments fall through to usage "with no special-casing". The current `runCommand` in `src/plugins/sql/activate.ts` reintroduced `/\s(?:left|right)$/i.test(value)` in the missing-value check, contradicting those decisions. This repair removes that special-case and nothing else; it does not amend the source plan or broaden into any other subplan's files.

Out-of-scope areas from the source plan remain out of scope: no dock-parameter removal (subplan 4), no payload/client changes (subplan 5), no spec edits (subplan 6).

## Approach

1. In `src/plugins/sql/activate.ts`, reduce the keyword branch guard from `if (!value || /\s(?:left|right)$/i.test(value))` to `if (!value)`, so the trimmed remainder is used verbatim. Leave the lower-case `file`/`database` keyword comparison, the `path.resolve(process.cwd(), value)` plus `existsSync` check, the `isValidDatabaseName` branch, the bare-`sql` choice, and all three `openDatabase(..., undefined, ...)` calls exactly as they are.
2. Correct the `runCommand` comment in that file: it currently says a removed trailing dock word is a usage error while the code inspected the value for one. Make it state that the value is verbatim and no form docks.
3. In `src/plugins/sql/activate.test.ts`, update the two assertions that expect `sql file <path> left` to report usage, and add cases for real paths ending in a space-separated dock word.

## Implementation steps

1. Edit the guard and its comment in `src/plugins/sql/activate.ts`. Run `$janissary/scripts/run.mjs check-diff`.
2. Update and add tests in `src/plugins/sql/activate.test.ts` as described under Tests. Run `$janissary/scripts/run.mjs check-diff`.
3. Complete the remaining task steps (plan promotion, backlog cleanup, publication).

## Tests

Mirror the existing `fakeCapabilities` / `outcome` conventions in `src/plugins/sql/activate.test.ts`:

- In the `sql command grammar` block, the case `refuses the old bare name, the removed dock words, and a trailing dock word`: drop `file ${shopFile} left` from the usage loop and assert instead that it reports `No database file at "<path.resolve(process.cwd(), `${shopFile} left`)>".` with no tab opened. Keep the bare-name / removed-dock-word usage assertions.
- Add a case creating a real temporary file whose path ends in a space-separated `left` and one ending in `LEFT` (upper-case), and assert `file <path>` opens a tab keyed `sqlite:<path>` with no rejection — proving the trailing token is part of the verbatim path.
- In the `sql plugin command` block, the case `refuses an unrecognized argument with usage, and opens no tab`: replace the `file ${shopFile} left` usage assertion with the same missing-path line `No database file at "<resolved path with ' left'>".` and no tab opened.
- Keep the name-guard, `UNKNOWN_DATABASE`, bare-choice, key/title, dock-never-called, and shared-path cases untouched and passing.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each change; confirm all `src/plugins/sql/` tests pass. If a failure looks environmental (loopback TCP EPERM in socket tests unrelated to the changed files), report it rather than weakening tests. Do not run `npm run check`.

## Out of scope

- No changes to `src/plugins/sql/shared-intents.ts`, `open-tab.ts`, `tabs.ts`, `intents.ts`, or any client/payload/spec file.
- No PR description correction: the backlog entry does not call for one.
- No commit rewriting or force-push; one new Conventional Commit on `feat/sql-file-path`.
