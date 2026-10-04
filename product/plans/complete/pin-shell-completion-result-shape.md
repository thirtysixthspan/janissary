# Pin the shell completion result shape

**Complexity: 3/10** — add a compile-time assignability regression to the existing import-free shell contract tests; no runtime contract or wire shape changes.

**Goal.** A future change to the server's `CompletionResult` cannot silently leave the shell plugin's separately declared completion shape stale.

**Approach.** Keep `src/plugins/shell/shared.ts` import-free, as required by the client-shared plugin contract. In its colocated test, assign the shell completion type to and from the server `CompletionResult` type so either direction of drift fails typechecking.

## Implementation steps

1. Add the two-way completion-type pin in `src/plugins/shell/shared.test.ts`.
2. Update `product/specs/shell-tab.md` to state the shell tab's one-match, multiple-match, and no-match completion behavior.
3. Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- `src/plugins/shell/shared.test.ts`: both `ShellCompletion` to `CompletionResult` and reverse assignment compile and preserve the completion values.
- Run the repository's diff-scoped check workflow, including server typecheck and tests.

## Out of scope

- Importing the server completion type into the import-free `shared.ts` contract.
- Changing completion behavior or the plugin API version.
