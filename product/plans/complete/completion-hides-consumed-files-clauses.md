# Hide consumed clauses from `files` completion

**Complexity: 2/10** — one completion module needs to apply state it already parses, with focused regression coverage and small spec/documentation updates. The parser behavior and filesystem matching stay unchanged.

## Goal

At a `files` clause position, completion currently offers `in`, `on`, and `with` even after those once-only clauses have already been consumed. For example, `files on left <Tab>` suggests `on` again even though a repeated `on` becomes part of the path. Suggestions should omit each consumed clause while keeping unused clauses, view keywords, and path matches available in their existing priority order.

## Approach

Carry the parsed `ClauseState` with the keyword completion slot and use its `inSeen`, `onSeen`, and `withSeen` flags to build the available keyword list. Keep view keywords, `print`, bare side suggestions, and filesystem candidates governed by their current rules. Add focused completion tests for all three once-only clauses and update the completion spec and its existing user-facing guide.

## Implementation steps

1. In `src/completion/files.ts`, pass the parsed clause state into keyword candidate generation and exclude only the `in`, `on`, or `with` keyword whose flag is set.
2. In `src/completion/files.test.ts`, verify each used clause disappears while unused clauses and filesystem path matches remain available. Keep the existing parser coverage in `src/file-navigator/args.test.ts` unchanged.
3. Update `product/specs/tab-completion.md` and `documentation/user-documentation/command-bar/tab-completion.md` to state that once-only clause suggestions disappear after use.

## Tests

- `src/completion/files.test.ts`: after a completed `in`, `on`, or `with` clause, its keyword is absent from suggestions; another unused clause and a known path match remain available.
- `src/file-navigator/args.test.ts`: existing once-only parser behavior remains covered and passes unchanged.

## Out of scope

- Changing how `parseFileNavigatorArgs` consumes clauses or handles repeated clauses.
- Changing view keyword, print-target, side, or filesystem path matching and ordering.
- Updating command syntax pages, since the accepted `files` syntax is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation step and confirm all relevant diff-scoped checks pass.
