<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the verification step that expects a usage line for `sql file <path> left`

Existing Issue: The base-branch Verification in `product/plans/ready/sql-path.md` says `sql file <path> left` reports the usage line, but the command reports a missing-file error for the verbatim path. Severity: 3/10

Existing Risk: 3/10 - A reviewer following the stale step would record a false failure and could push a fix that turns correct verbatim-path behavior into a usage error.

Proposal Risk: 1/10 - The step and the description's How to verify already agree on the correct expectation, so the only residual risk is a reviewer re-checking an already-correct line.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2162 "Correct the verification step for a trailing dock word in a file path". This is a step correction, not a behavior failure. The stale text is the Verification bullet of `product/plans/ready/sql-path.md` on the base branch: "confirm `sql database <name>` still opens a named database with its ordinary select, bare `sql` still opens the last-used database, `sql <name>` and `sql file <path> left` both report the usage line, and `sql file <missing>` reports `No database file at \"<path>\".`". Steps D11 and D12 (description) were executed with the documented scratch fixtures. `sql shop` reported `Usage: sql [file <path>|database <name>]`, but `sql file <project-dir>/fixtures/shop.sqlite left` reported `No database file at "<project-dir>/fixtures/shop.sqlite left".` and opened no tab, exactly as `src/plugins/sql/activate.ts` `runCommand` takes the trimmed remainder verbatim and as the PR description's Behavior examples and How to verify step 12 state. The verification bullet should read: "confirm `sql <name>` reports `Usage: sql [file <path>|database <name>]`, while `sql file <path> left` reports `No database file at \"<path> left\".` because ` left` stays part of the verbatim value and opens no tab." The description's How to verify already carries this expectation, so no description edit is needed; the correction belongs to the stale verification text the reviewer follows.
