<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's complete `files` summary in the command table.

Existing Issue: The command-table row does not name the supported detail modes or the `expand`, `collapse`, `cursor`, `anchor`, and `select` clauses that the feature plan specifies for the `files` summary. Severity: 4/10

Existing Risk: 3/10 - Readers using the command list cannot discover the view-restoration grammar or distinguish the supported detail modes without finding the dedicated `files` help page.

Proposal Risk: 1/10 - The command list summarizes the complete syntax while the dedicated `files` page remains the detailed reference.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "complete the files command summary". Update the `files` row in `help/commands.md` to include the four detail modes and the `expand`, `collapse`, `cursor`, `anchor`, and `select` clauses specified in design decision 32 of `product/plans/complete/restoring-a-file-trees-view-from-the-command-line.md`, while retaining the quoted-label note from `product/plans/complete/quoted-file-navigator-tab-labels.md` and staying within the 350-character cap recorded in `product/plans/complete/bound-files-command-help-length-exception.md`. Add or refine an assertion in `src/commands.test.ts` to pin the row's required details alongside its existing length and ordering checks.


* Preserve the plan's trailing `in <label>` form for a tab named `in`.

Existing Issue: `readTrailingIn` treats the final bare `in` in `src in in` as a missing label instead of using the second `in` as the tab label. Severity: 4/10

Existing Risk: 3/10 - A valid `files <path> in <label>` command fails whenever the target tab's literal label is `in`.

Proposal Risk: 1/10 - A trailing `in in` pair resolves the label while a lone trailing `in` continues to report the missing-label error.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "preserve the in tab name in trailing files clauses". Adjust `readTrailingIn` in `src/file-navigator/args.ts` to recognize a final bare token as the value when it is preceded by the bare `in` clause, and only classify a final `in` as missing when no value follows it. Add parser regressions in `src/file-navigator/args.test.ts` proving `src in in` yields target `src` and label `in`, while `src in` remains a missing-label case; add a manager regression in `src/file-navigator/manager.test.ts` confirming the command targets the tab labeled `in`. Preserve quoted trailing-label parsing and the existing ordinary path-before-label cases.
