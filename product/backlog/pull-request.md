<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle a bare `in` token with no value as the file-navigator path target.

Existing Issue: `readInClause` treats `files in` and `files left in` as missing-label errors, while the pre-change parser treated those bare tokens as path targets. Severity: 4/10

Existing Risk: 3/10 - A project with a directory named `in` gets an error from its shortest valid `files` command, although spelling the path as `./in` remains a workaround.

Proposal Risk: 1/10 - Preserving the no-value path case while retaining the missing-label error after a path keeps both behaviors explicit and leaves only an unusual literal directory name at risk of a future parser regression.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "preserve bare in paths when no label follows". In `src/file-navigator/args.ts`, leave a bare `in` without a following token for path resolution when it appears before any path, while preserving the existing trailing `in` missing-label result for forms such as `files src in`. Add parser cases in `src/file-navigator/args.test.ts` for `in`, `left in`, and `src in`, then add a manager regression in `src/file-navigator/manager.test.ts` proving that `files in` opens a directory literally named `in`. Clarify the bare-path behavior in `product/specs/file-navigator-tab.md`; keep the documented missing-label error unchanged for the path-before-label form. Verify the focused parser and manager cases without changing unrelated files.
