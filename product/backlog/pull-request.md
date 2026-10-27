<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reduce technical debt by sharing the duplicated help-page path confinement check.

Existing Issue: `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts` independently implement the same `regularHelpPagePath` realpath and regular-file confinement check. Severity: 4/10

Existing Risk: 5/10 - A later change to one copy can leave the other with a weaker boundary, so in-app help and generated documentation may disagree about which files are safe to read.

Proposal Risk: 2/10 - A shared validator makes confinement changes apply to both readers, while each surface's existing tests can continue to verify its behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "share help-page path confinement validation". Extract the common regular-file and resolved-path check into a focused module such as `src/help-page-files.ts`, then import it from `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts` and remove both duplicate implementations. Keep runtime and docs listing, index-page, and rendering behavior unchanged. Preserve the symlink and confinement coverage in `src/help-pages.test.ts` and `scripts/command-reference.test.mjs`, and verify both readers use the shared helper.
