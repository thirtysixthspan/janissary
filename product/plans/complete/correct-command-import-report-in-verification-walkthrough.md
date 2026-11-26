# Correct the command import report in the verification walkthrough

**Complexity: 1/10** — no production code added or edited, no test scenarios, no new units; 8 prose requirements drive p=3.127 for a one-line description correction plus plan and backlog bookkeeping.

## Goal

The pull request's `### How to verify` section, step 2 (Import from the command in a local tab), tells the reader to expect the transcript note `Imported 1 host from ~/.ssh/config.` while the Setup fixture it shares with step 1 skips two aliases. Every other report in the description already carries the `; skipped 2.` clause that the implementation produces, so this one Expect line is the only place the walkthrough disagrees with the code. Correct that single line to `Imported 1 host from ~/.ssh/config; skipped 2.` and leave the author's every other description paragraph exactly as written.

## Requirements

1. "In the pull request body's How to verify section, step 2, change the Expect transcript note to `Imported 1 host from ~/.ssh/config; skipped 2.`" — the one transcript note in step 2's Expect line carries the `; skipped 2.` clause.
2. "so it matches the shared Setup fixture" — the corrected note is the summary the Setup config actually produces, where `bad` is skipped for its invalid user and the saved `web2` is skipped as a clash.
3. "Keep the step's other assertions" — the rest of step 2's Expect line, including its no-tab-open and already-open-Hosts-tab assertions and its cited cases at `src/plugins/hosts/activate.test.ts:269-284,297-311` and `src/plugins/hosts/activate.ts:58-63`, is unchanged.
4. "the identical report in step 1" — step 1's Expect note `Imported 1 host from ~/.ssh/config; skipped 2.` stays byte-for-byte as the author wrote it.
5. "and every other paragraph of the description byte for byte" — no paragraph other than the step 2 Expect line is rewritten, reordered, or reformatted, and the title is untouched.
6. "apply the body edit with gh pr edit --body-file only after the branch commit is pushed" — the GitHub body edit runs only after a successful `git push`, never before it.
7. "No source or test file changes." — no application code, test, spec, help page, or user/developer documentation file is edited.
8. "confirm the pull request stays OPEN on the same head branch" — the pull request remains open on `feat/hosts-ssh-alias-import-export` after publication, with its head matching the pushed commit.

## Design decisions

- The `### How to verify` heading and the numbering and wording of step 2 stay; only the one transcript-note string inside its Expect line changes. Removing or restructuring the step would be a larger edit than the work item asks for.
- The replacement string is taken from the summary the shared Setup fixture produces, not invented: `importSummary` in `src/plugins/hosts/import-ssh.ts:32-37` appends `; skipped ${skipped}` before the period, and `src/plugins/hosts/import-ssh.test.ts:74` asserts the exact result for the same config.
- The clause is `; skipped 2.` — two aliases are skipped (`bad` for its invalid user, the saved `web2` as a clash), matching step 1's already-correct report and the `### Behavior examples` block.
- The citations on step 2 stay even though the cases they name use their own smaller config and still assert the shorter string; they pin the command dispatch, no-tab-open and already-open-tab behaviour, which this correction does not alter. Rewriting those tests is explicitly out of scope.
- `gh pr edit` replaces the whole body, so preservation is done by writing the complete body to `./temp/pr-body.md` with only the one string changed and passing that file to the command. `temp/` is gitignored, so the scratch file never reaches a commit.
- The body edit lands after the push. If checkout, checks, commit, or push fails, the pull request still carries the author's original description rather than describing work absent from its branch.
- The resolved backlog entry is removed and the plan is promoted to `complete/`, so a description-only fix still produces a commit for `pr-check-changes` to ship. With the second entry still unresolved, the backlog is not drained.

## Preserved behavior

1. The command import path keeps producing a summary with a `; skipped <n>` clause when aliases are skipped; it must not drop or reword that clause. The existing test `adds the importable aliases in one write and leaves a clashing saved host unchanged` in `src/plugins/hosts/import-ssh.test.ts:53` must keep passing and pins this behavior.
2. Step 1's button-path Expect note and the `### Behavior examples` report stay byte-for-byte; they must not be rewritten to match the corrected step 2 line. There is no automated test for description prose, so this is held by the reading check in Verification rather than an existing test.

## Assumptions

1. `src/plugins/hosts/import-ssh.ts:32-37` holds `importSummary`, which appends `; skipped ${skipped}` when `skipped !== 0` and returns `Imported 1 host from <path>; skipped 2.` for the Setup counts.
2. `src/plugins/hosts/import-ssh.test.ts:53-80` holds the shared Setup config (`bad`/`a@b`, `web1 web2` with `%h.corp.example` and port `2222`, `db*`, and `Host *` with `User ops`) whose case asserts `summary: 'Imported 1 host from ~/.ssh/config; skipped 2.'` at line 74.
3. `product/backlog/pull-request.md:5` holds `* Correct the description's command import report in the verification walkthrough, which drops the skipped clause the shared fixture produces.`, the recorded work item this run resolves.
4. `product/backlog/pull-request.md:13` holds the `Proposal:` that names this exact invocation and the exact replacement string, so the invocation selector matches a recorded entry rather than a new work item.
5. The pull request body fetched with `gh pr view <reference> --json body` has one occurrence of `Imported 1 host from ~/.ssh/config.` with no skipped clause, in step 2's Expect line, and a second, already-correct occurrence in step 1's Expect line.

## Existing functionality

1. `src/plugins/hosts/import-ssh.ts:32-37` provides the summary formatter `importSummary` that the corrected note must mirror, with the quoted fragment `` `; skipped ${skipped}` ``.
2. `src/plugins/hosts/import-ssh.test.ts:74` provides the asserted exact string `Imported 1 host from ~/.ssh/config; skipped 2.` that the replacement copies verbatim.
3. `product/specs/hosts-tab.md:110-112` provides the already-correct user-visible rule `A summary gains ; skipped <n> before the period when aliases were skipped`, so no spec change is required.
4. `ai/tasks/feature/work-pull-request-issue.md:148` provides the multi-line body edit route, the quoted command `gh pr edit <reference> --body-file ./temp/pr-body.md`, which avoids shell quoting problems with markdown.
5. `product/backlog/pull-request.md:1-3` provides the comment-and-heading skeleton that the file keeps, with the second entry still present, after the resolved entry is removed.

## Implementation steps

1. Read the current pull request body with `gh pr view <reference> --json body` and mark the exact bounds of step 2's Expect line. Confirm `importSummary` at `src/plugins/hosts/import-ssh.ts:32-37` and the assertion at `src/plugins/hosts/import-ssh.test.ts:74` still produce the target string for the Setup config. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Build the complete revised body in `./temp/pr-body.md`: change only the transcript note in step 2's Expect line from `Imported 1 host from ~/.ssh/config.` to `Imported 1 host from ~/.ssh/config; skipped 2.`, leaving the step's other assertions, step 1's identical report, and every other paragraph byte-for-byte as fetched. Do not call `gh pr edit` yet. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Remove the resolved entry whole from `./product/backlog/pull-request.md`, leaving the second dangling-symlink entry byte-for-byte unchanged and the leading comment and heading in place. Move the finished plan from `./product/plans/ready/` to `./product/plans/complete/` with plain `mv`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Confirm with `git status` that the only tracked changes are the completed plan file and the one removed backlog entry, and that no source, test, spec, help, or documentation file was touched. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Commit the file changes with a Conventional Commit subject describing the description correction, push to the same head branch, and only then apply the staged body with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Confirm the pull request is still `OPEN`, its head branch is unchanged, and its `headRefOid` matches `git rev-parse HEAD`. Build command: `$janissary/scripts/run.mjs check-diff` after each file change; the body edit itself changes GitHub state, not the tree.

## User interface

1. None. This change edits pull-request prose and two product-planning files; it adds or changes no surface a user sees or operates inside the app, and no application behavior is modified.

## Tests

This plan changes no application behavior and introduces no code, so no new tests are written. The existing case `adds the importable aliases in one write and leaves a clashing saved host unchanged` (`src/plugins/hosts/import-ssh.test.ts:53`) already asserts the exact corrected string at line 74 for the same Setup config, so the description points at proof that is already in the tree rather than creating new proof. No test of description prose is introduced. `$janissary/scripts/run.mjs check-diff` is the check for the file changes.

## Out of scope

- Step 2's other assertions, step 1's identical report, the `### Behavior examples` block, and every description paragraph other than the step 2 Expect line.
- The pull request title and any change-set statistics in the description.
- Source code, tests, CSS, functional specs, help pages, and both `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The second, dangling-symlink backlog entry, which stays unresolved on this branch.
- `product/backlog/issues.md` and any new backlog entry for the named work item, which was already recorded on this branch.
- Merging, closing, or replacing the pull request, and rewriting any published commit.

## Verification

`$janissary/scripts/run.mjs check-diff` — expected green after every file change; with no source under `src/` or `web/src/` changed, it checks only the touched files and reports no lint, typecheck, or test regression.

Manual, reading-based: run `gh pr view <reference> --json body` and confirm step 2's Expect note now reads `Imported 1 host from ~/.ssh/config; skipped 2.`, that its other assertions and citations are unchanged, and that step 1's report and every other paragraph are byte-for-byte what the author wrote. Read `src/plugins/hosts/import-ssh.ts:32-37` and the assertion at `src/plugins/hosts/import-ssh.test.ts:74` and confirm they still produce that exact string for the Setup config. A failure is any other paragraph rewritten, the step's other assertions altered, a body edit applied before the push, or the pull request closed or moved off its head branch.
