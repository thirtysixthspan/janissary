<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Avoid quadratic work when tracking and reporting many moves.

Existing Issue: Move recording repeatedly scans all chains and prior hops, and change and row derivation scan chains for each write or place, making a patch with many moves quadratic. Severity: 6/10

Existing Risk: 6/10 - A valid patch containing many short move sections can monopolize the synchronous server as its move count grows.

Proposal Risk: 2/10 - Large patches still require work proportional to their sections, but indexes avoid repeatedly traversing the accumulated move history.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "avoid quadratic work when tracking and reporting many moves". In src/file-patch/move-chains.ts and its callers maintain indexed chain lookup, vacated-place membership, and a monotonic hop order without rescanning prior chains or hops; in src/file-patch/changes.ts and src/file-patch/rows.ts index surviving chains by content and by origin and destination before deriving writes and rows. Preserve chain survival, ordering, exchange, link, and net-row semantics, and add regression coverage in src/file-patch/sections.test.ts or focused tests that verifies large collections do not trigger a full chain scan for each move, write, or row. Run the diff-scoped checks.


* Follow a moved relative symbolic link from its new directory.

Existing Issue: A moved symbolic link keeps its old resolved content target even when its unchanged relative link text resolves to a different path at the destination. Severity: 8/10

Existing Risk: 8/10 - A later update through the moved link can silently modify the old target while the moved link points at another file or is dangling.

Proposal Risk: 2/10 - Relative-link resolution remains sensitive to filesystem state, but resolving the destination target under the existing containment and text policies makes the view match the committed link.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "follow a moved relative symbolic link from its new directory". Update src/file-patch/moves.ts and src/file-patch/section-steps.ts so a moved link's unchanged relative text is interpreted from the destination parent when later sections follow it, subject to the existing workspace and protected-path checks and the view's current state; preserve the link itself and its text for the rename. Add tests in src/file-patch/sections.test.ts for moving a link between directories when its new target differs, is missing, or falls outside the workspace, and confirm later updates affect only the correct in-root target or fail safely. Run the diff-scoped checks.
