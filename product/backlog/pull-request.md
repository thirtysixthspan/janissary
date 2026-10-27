<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where a tab reorder during printing can attach another tree's selection to the command.

Existing Issue: `FileNavigatorManager.printView` captures the target's numeric tab index before awaiting the browser selection request, then reads that index from a reply collected later, so a tab insertion, removal, or reorder during the wait can associate another navigator's relative paths with the requested tree's root. Severity: 5/10

Existing Risk: 4/10 - A printed command can reopen the requested tree with another tree's cursor and selection, highlighting unrelated rows when the command is replayed.

Proposal Risk: 2/10 - Stable navigator identity across the request prevents selection data from being mixed between trees, though a tree closed during the request still needs a defined no-selection outcome.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "keep files print selection tied to its target navigator". Carry a stable navigator identity through client selection collection and its reply instead of relying on a positional index, then have `FileNavigatorManager.printView` use only the matching record after the request completes and omit selection data if that tree has closed. Update `src/protocol/file-navigator.ts`, `web/src/file-navigator/file/navigator-selection-registry.ts`, and `web/src/file-navigator/useFileNavigatorSelection.ts` to publish stable identities; preserve them through `src/file-navigator/selection-request.ts`, and update `src/file-navigator/manager.ts` and `src/profile/save/route.ts` to resolve records by identity. Add regressions in the navigator manager and selection-request tests that reorder or remove an earlier navigator while the request is outstanding and verify that printed output never contains another tree's selection; retain the existing local print, remote-tree, profile-save, and joined-request coverage.
