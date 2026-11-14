<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document in the file glob help page and ACP spec that a backslash in a pattern is a folder separator and never an escape, so a user trying to match a literal `*` or `{` learns why it doesn't work and what to write instead.

Existing Issue: The matcher rewrites every `\` in a pattern to `/` before compiling it, so `\*` and `\{` become a folder break followed by a live wildcard or brace group, but `help/file.md` Finding files and `product/specs/acp.md` `### File glob` mention this only inside the `..` refusal sentence ("with `\` read as `/`") and never as a pattern rule. Severity: 3/10

Existing Risk: 3/10 - A person or agent used to POSIX globs writes `foo\*.ts` to match a literal star and silently gets `foo/*.ts` results or `(no matches)`, with nothing in the help to explain it.

Proposal Risk: 1/10 - The behavior is unchanged and now stated; the remaining risk is wording that names the wrong workaround, which a matcher test for the named workaround would expose.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "document that a backslash in a file glob pattern is a folder separator, not an escape". In `help/file.md` **Finding files**, in the pattern-rules paragraph beside the extglob sentence, add one sentence that `\` is read as `/`, so it separates folders and cannot escape a wildcard, and that a literal `*`, `?`, `{`, or `[` in a name is matched with a bracket class such as `[*]`; state the same rule in the pattern paragraph of `product/specs/acp.md` `### File glob`. Before writing the workaround, confirm it with the matcher: add a case to `src/file-glob/match.test.ts` asserting `createGlobMatcher('a[*].ts', false)('a*.ts')` is true and `createGlobMatcher(String.raw`a\*.ts`, false)('a*.ts')` is false, and if the bracket form does not match under the options in `src/file-glob/match.ts`, document only that escaping is unsupported and name no workaround. Do not change `normalizeGlobPattern` or the minimatch options; the existing test `treats a backslash as a path separator` in `src/file-glob/match.test.ts` pins the behavior being documented and must keep passing.


* Correct the pull request description's list of updated documentation so it also names the two user-documentation pages the branch changes. (Description-only: this proposal changes only the PR description.)

Existing Issue: The description's closing inventory names the updated specs and help pages but not `documentation/user-documentation/tab-types/roles.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`, which the diff also edits to describe the new ask capability, the thirteen-command vocabulary, and where a granted `file glob` runs. Severity: 2/10

Existing Risk: 2/10 - A reviewer who uses the inventory as the list of docs to check skips the two user-facing pages, so a wording error there ships unreviewed.

Proposal Risk: 1/10 - Only the description changes; the remaining risk is the inventory drifting again if a later repair touches another page, which comparing it with `git diff origin/master...HEAD --name-status` would show.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "name the two updated user-documentation pages in the PR description". Change only the pull request description: read it with `gh pr view 2001 --json body`, and in the paragraph that begins `The plan is product/plans/complete/file-glob.md.`, after the `Help updated:` sentence, add `User documentation updated: tab-types/roles.md and advanced-agents/acp-agent.md.` Leave every other paragraph byte-for-byte unchanged, add no change-set statistics, and apply the body with `gh pr edit --body-file` after the push. No code, test, spec, help, or documentation file changes, so no test run is needed.
