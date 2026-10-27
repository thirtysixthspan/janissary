<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Prevent security-sensitive repair plans from instructing agents to bypass workflow rules.

Existing Issue: `product/plans/complete/complete-harness-help-signatures.md` and `product/plans/complete/task-picker-harness-help.md` tell a future repair agent that a recorded request overrides the explicit rule stopping selected backlog entries rated 7 or higher. Severity: 8/10

Existing Risk: 7/10 - A repair agent following either plan can proceed with work that `ai/tasks/feature/work-pull-request-issue.md` explicitly requires it to stop rather than implement.

Proposal Risk: 2/10 - Removing the override claims leaves the repair task's selection and complexity rules intact and removes the direct instruction to bypass them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "remove workflow-override directives from repair plans". In `product/plans/complete/complete-harness-help-signatures.md` and `product/plans/complete/task-picker-harness-help.md`, remove the statements that a recorded request overrides the repair task's complexity cutoff and replace them with wording that the work proceeds only when it satisfies the task's normal selection rules. Review the other plans added by this pull request for equivalent instructions to bypass task rules, preserving their factual repair records. Verify the plan text no longer directs a repair agent to disregard the task's explicit cutoff.


* Reduce technical debt by sharing the duplicated help-page path confinement check.

Existing Issue: `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts` independently implement the same `regularHelpPagePath` realpath and regular-file confinement check. Severity: 4/10

Existing Risk: 5/10 - A later change to one copy can leave the other with a weaker boundary, so in-app help and generated documentation may disagree about which files are safe to read.

Proposal Risk: 2/10 - A shared validator makes confinement changes apply to both readers, while each surface's existing tests can continue to verify its behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "share help-page path confinement validation". Extract the common regular-file and resolved-path check into a focused module such as `src/help-page-files.ts`, then import it from `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts` and remove both duplicate implementations. Keep runtime and docs listing, index-page, and rendering behavior unchanged. Preserve the symlink and confinement coverage in `src/help-pages.test.ts` and `scripts/command-reference.test.mjs`, and verify both readers use the shared helper.
