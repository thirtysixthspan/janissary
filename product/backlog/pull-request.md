<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the new scope test's header comment so it describes every behavior the file pins instead of ending with "Nothing else.", removing technical debt the later assertions introduced.

Existing Issue: The header comment of `scripts/review-pull-request-scope.test.mjs` says the file pins only the safeguards, the bare-invocation default, and the absence of override prose, and closes with "Nothing else.", while the file also pins the `Scope:` report check, the hexadecimal SHA check, the range-base check, the unknown-keyword gate, and the missing description-only shortcut. Severity: 2/10

Existing Risk: 3/10 - A maintainer trusting the comment's "Nothing else." treats the later assertions as scope creep and deletes them, silently unpinning the mis-scoped-review block and the shell-safety check that the repairs added.

Proposal Risk: 1/10 - The comment then lists what the file pins, so the only remaining drift is a future assertion added without updating it, which a reader would notice against the list.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "update the scope test's header comment to name every behavior it pins". In `scripts/review-pull-request-scope.test.mjs`, rewrite the leading comment block so it names each behavior the `describe` block pins: every scope keeps the review's safeguards, a bare invocation reviews the full pull request, the complex-feature workflow passes scopes rather than override prose, a focused or resolution review that reports another scope blocks the workflow, scope SHAs are checked as lowercase hexadecimal before any git command and quoted when placed in one, a range base must lie on the pull request or be its merge base, every non-aggregate request is validated including an unknown keyword, and Step 6 has no description-only shortcut. Keep the closing "Nothing else." only if it is then true. Change no assertion. If the comment's line count changes, the pull request description's anchors into this file (the assertion span and each `it` line it cites) shift, so re-derive them with `grep -n` and correct them in the same repair. Verify with `$janissary/scripts/run.mjs check-diff`, confirming the file's tests still pass unchanged.
