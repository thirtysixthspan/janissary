# docs(pr): correct the exemption rationale in the check-diff PR description

**Complexity: 1/10** — 3 requirements for one description sentence, no production code, test scenarios, or new units (p=2.56)

## Goal

Pull request #2209 describes its `max-lines` exemption as a consequence of the script already being long enough, but `scripts/check-diff.mjs` is 158 lines. This work corrects the final sentence of the description's "What" section so it states the exemption's forward-looking rationale instead. No code, config, guideline, spec, or test changes with it: the exemption itself is intended and correct, and the description is the only inaccurate artifact.

## Requirements

1. The final sentence of the "What" section states that the runner is exempted from `max-lines` so it may grow past 200 lines. Work item: "Correct the pull request description's claim that the script is already long enough to need the 200-line exemption."
2. That sentence still names the matching note in `ai/guidelines/code-guidelines.md` and the observable-behavior description in `product/specs/testing.md`. Proposal: "with the matching note in `ai/guidelines/code-guidelines.md` and the observable behavior described in `product/specs/testing.md`."
3. Every other paragraph of the description stays as the author wrote it, and no claim in the corrected sentence drifts from the four files named as out of scope. Proposal: "Do not change `eslint.config.mjs`, `ai/guidelines/code-guidelines.md`, `scripts/check-diff.mjs`, or `product/specs/testing.md`".

## Design decisions

- Correct the live PR body only, after the repository bookkeeping is pushed, so a failure in an earlier step never leaves the description claiming work that is not on the branch.
- Write the full revised body to `./temp/pr-body.md` and replace it with `gh pr edit <reference> --body-file`, falling back to `gh api -X PATCH repos/thirtysixthspan/janissary/pulls/2209 -F body=@./temp/pr-body.md` when GraphQL fails. `temp/` is gitignored, so the scratch file cannot reach a commit.
- Preserve the rest of the body verbatim by reconstructing it from `gh pr view <reference> --json body` and changing only the named sentence; leave the title alone.
- Leave the exemption itself alone: `eslint.config.mjs`, `ai/guidelines/code-guidelines.md`, `scripts/check-diff.mjs`, and `product/specs/testing.md` are already correct and stay untouched.
- State no change-set statistics in the corrected sentence: no commit counts, file counts, line counts, or SHAs.

## Preserved behavior

None found. This change edits no repository code, so no existing test pins the description text, and the four files named as out of scope are explicitly left unchanged.

## Assumptions

1. `scripts/check-diff.mjs` is 158 lines, so the "already long enough" claim is false: `wc -l scripts/check-diff.mjs` reports `158`.
2. The exemption is already applied to scripts: `eslint.config.mjs:120-123` "`files: ['scripts/**/*.mjs'],`" and "`rules: { 'max-lines': 'off' },`".
3. The guideline already records the exemption: `ai/guidelines/code-guidelines.md:6` "Files under `scripts/` are exempt from this limit: they are one-off tooling, not application code."
4. The testing spec already describes the observable behavior: `product/specs/testing.md:27` "### Diff-scoped check runner".
5. The PR body's "What" section ends with the inaccurate sentence: `gh pr view 2209 --json body` "The script is now long enough that `scripts/**/*.mjs` is exempt from the 200-line rule, with a matching note in the code guidelines and a description of the observable behavior in the testing spec."

## Existing functionality

1. The PR body is read with `gh pr view <reference> --json body` and replaced with `gh pr edit <reference> --body-file ./temp/pr-body.md`, per the work-pull-request-issue task's Step 8.
2. The REST fallback writes the same file with `gh api -X PATCH repos/thirtysixthspan/janissary/pulls/2209 -F body=@./temp/pr-body.md`.
3. The proof for the exemption already exists as step 10 of the PR's "How to verify": `npx eslint --print-config scripts/check-diff.mjs` shows `max-lines` off and `npx eslint --print-config src/commands.ts` shows `error` with `max: 200`.

## Implementation steps

1. **Record the fix.** Write this plan under `product/plans/draft/`, rate it, move it to `product/plans/ready/`, and promote it to `product/plans/complete/`; remove the resolved entry from `product/backlog/pull-request.md`, then commit and push that bookkeeping. These are the only repository files this fix touches. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Correct the description.** After the push, read the current body and replace only the final sentence of the "What" section with a statement that the runner is exempted from `max-lines` so it may grow past 200 lines, with the matching note in `ai/guidelines/code-guidelines.md` and the observable behavior described in `product/specs/testing.md`. Leave every other paragraph exactly as written. Apply through the body file, with the REST fallback if GraphQL fails. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The surface is the pull request description on GitHub, not a terminal or application view.
2. The only visible change is the final sentence of the "What" section; the "Behavior examples" and "How to verify" sections, including step 10's `max-lines` check, remain as the author wrote them.
3. The corrected sentence names no commit counts, file counts, line counts, or SHAs, so it cannot go stale after a later push.

## Tests

No tests are added. The fix changes no application behavior and adds no code: it edits one sentence of a GitHub pull request body. The plan template calls for saying so explicitly here rather than inventing tests, and tests of documentation are not introduced. Verification is the reading-based check in Verification.

## Out of scope

- `eslint.config.mjs`, `ai/guidelines/code-guidelines.md`, `scripts/check-diff.mjs`, and `product/specs/testing.md`: the exemption is intended and correct.
- The PR title, the rest of the description, and the "How to verify" steps.
- Merging or closing PR #2209; it stays open.
- The second backlog entry about the completed plan's no-guard design decision; it is a separate work item.
- User and developer documentation under `documentation/`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Read `gh pr view 2209 --json body` and confirm the "What" section's final sentence reads as a forward-looking rationale, with no claim that the runner is already long enough for the exemption.
3. Read `eslint.config.mjs:120-123`, `ai/guidelines/code-guidelines.md:6`, `scripts/check-diff.mjs` (`wc -l` = 158), and `product/specs/testing.md:27-35`: confirm every other claim in the corrected sentence still matches these files, and that the four files themselves are unchanged in the commit.
4. Confirm the PR is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD`.
