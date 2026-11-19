# Correct PR 2099 verification steps and roles fixture to use catalog-enabled model ids

**Complexity: 1/10** — description-only metadata correction: 0 production lines/files edited, 0 requirements or test scenarios, 0 new units (p=1.58)

## Goal

PR 2099's "How to verify" section and Behavior examples repeatedly name `claude-sonnet-5-5`, an id that does not exist in the bundled model catalog. Steps D1/D6/D7/D8 can never pass as written: the most-used dropdown, the typed `sonnet` match, and the recorded launch command all silently use `claude-sonnet-5` instead. The description must name an id the shipped catalog actually enables so a reviewer following it sees the behavior it promises. This is a description/metadata correction only — no source behavior changes.

## Approach

Verify the claim against the shipped data: `readCatalog` in `src/models/catalog-file.ts` serves the bundled `known-models.json` when the scratch project has no `.janissary/known-models.json` override; `modelsFor` in `src/models/manager.ts` publishes the enabled ids; and `mostUsedModels` in `web/src/shared/model-search/model-search.ts` ranks only ids present in that enabled set. The enabled `claude` ids are `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5-5`, `claude-sonnet-5`, `claude-sonnet-4-6`, and `claude-haiku-4-5`. `claude-sonnet-5-5` is not among them; `claude-sonnet-5` is enabled and contains the `sonnet` substring the steps type, so it is the minimal replacement that makes every step and example true.

Replace every `claude-sonnet-5-5` occurrence in the PR description's Setup catalog bullet, the Setup roles fixture and its summary line, steps 1/6/7/8 of "How to verify", and the Behavior examples with `claude-sonnet-5`. Leave all other description text byte-for-byte as authored — including the trailing "Additional test cases" section added by the prior test run, which names no such id. Apply the body edit only after the plan and backlog cleanup are committed and pushed, so the branch always carries its artifacts before the live GitHub body changes. Leave the PR open throughout.

## Implementation steps

1. Write and promote this fix plan to `./product/plans/complete/`.
2. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving the remaining entry byte-for-byte unchanged (the file is not drained).
3. Run `$janissary/scripts/run.mjs check-diff` to confirm the markdown-only changes introduce no lint, typecheck, or test failures.
4. Commit and push the plan plus backlog change to `feature/roles-model-search-input` with a Conventional Commits subject; do not amend or rewrite existing commits.
5. Read the current PR body with `gh pr view <url> --json body`. Replace every `claude-sonnet-5-5` with `claude-sonnet-5` in the Setup catalog bullet, the Setup roles fixture and its summary line, steps 1/6/7/8 of "How to verify", and the Behavior examples. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit <url> --body-file`. Preserve every other paragraph, code fence, and the entire "Additional test cases" section exactly; change no change-set statistics.
6. Verify the PR remains OPEN, its `headRefOid` matches the pushed `HEAD`, and the body no longer contains `claude-sonnet-5-5` while the "Additional test cases" section is unchanged.

## Tests

No new tests. This change edits only the PR description plus the repository's own plan and backlog files; no source behavior changes, so there are no scenarios to test. The feature's existing tests on the branch are unaffected. `check-diff` is run once as a sanity check on the markdown-only working-tree changes.

## Spec and docs

None needed. No user-visible behavior changes; the code and specs already describe the enabled-catalog-only behavior, and only the PR's verification text is corrected.

## Out of scope

- Any source, test, spec, help, or user-documentation file.
- The trailing "Additional test cases" section of the PR body and every other description paragraph not named by this work item.
- Changing the PR title, merging or closing the PR, or rewriting, squashing, or force-pushing history.
