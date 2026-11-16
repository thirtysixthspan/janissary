<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Avoid quadratic planned-folder work when validating a large patch.

Existing Issue: The view's `checkFolders` rebuilds and sorts the full planned-folder list on every path it resolves, so a patch with many short Add, Update, Delete, or Move sections spends time that grows with the square of the section count before it touches disk. Severity: 5/10

Existing Risk: 6/10 - A valid patch within the 5 MB argument cap that touches many small files can monopolize the synchronous server for a long time, stalling every other session and the tab that issued it.

Proposal Risk: 2/10 - A cached derivation removes the repeated scan, but a stale cache could plan a folder whose place was deleted or moved; invalidating on every existence change and covering the Add-then-Delete and Move-then-Add transitions keeps the existing folder and ENOTDIR behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "avoid quadratic planned-folder work when validating a large patch". In src/file-patch/view.ts, keep plannedFolders derived from the places but memoize its shallowest-first result and invalidate the memo whenever a place's exists flag changes, instead of rebuilding the list in checkFolders on every resolve. Add a PatchView.setExists(place, value) method (or an equivalent invalidation hook) and route the place.exists assignments in src/file-patch/sections.ts (add, remove, and section application) and src/file-patch/moves.ts (moveSection) through it; update the direct place.exists writes in src/file-patch/view.test.ts fixtures to the same method. Keep checkFolders' two rules unchanged: a resolved location that is a planned folder fails Is a directory, and a missing folder whose place exists fails with the ENOTDIR reason. Add a focused view or sections case with many resolves that counts plannedFolders rebuilds (for example by spying on the array sort the current build performs) and asserts the count does not grow per resolve, while the existing planned-folder, ENOTDIR, add-then-delete, and commit folder tests keep passing. The derivation contract stays the same; no plan change is needed unless the implementation chooses to expose a new method.


* Remove the patch record's unused link-target bookkeeping.

Existing Issue: The patch record's `linkTargets` map is written by `followLink` with each followed link target, but no code ever reads it, so it is dead state beside the link logic. Severity: 2/10

Existing Risk: 2/10 - A later reader or change can mistake the recorded target for live bookkeeping and either rely on a value nothing maintains or leave a needed link-target consumer unwritten.

Proposal Risk: 1/10 - Removing the map cannot change runtime behavior because the content reassignment and move-chain retargeting it sits beside stay in place, and the existing link cases cover that behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "remove the unused link-target bookkeeping from the patch record". In src/file-patch/changes.ts remove the linkTargets field from PatchRecord; in src/file-patch/sections.ts remove its Map initializer; in src/file-patch/section-steps.ts remove the record.linkTargets.set(place, current.location) line from followLink while keeping retargetLink(record.moves, place, current.content), place.content = current.content, and the missing-target and cycle checks untouched. No behavior or test expectation changes; the existing sections.test.ts link cases (in-root update, delete, delete-then-add, moved link, moved dangling link, and the deleted-link re-added-then-moved case) and commit.test.ts link cases must keep passing. If a future link-target consumer is intended, it belongs in a separate change with its own test.


* Update the ready web-search plan's stale reference to the file patch plan this change moved to complete.

Existing Issue: The ready web-search plan still points at the file patch plan in its old ready-folder location, which this pull request deleted, and still describes the remote port extraction it depends on as pending even though this pull request already moved the paste body into the port-mapped helper and the create-item helper already existed. Severity: 2/10

Existing Risk: 2/10 - A future web-search implementer follows a missing plan path or repeats an extraction this change already completed, which can produce a conflicting second helper and lost time.

Proposal Risk: 1/10 - A documentation-only correction; the only residual risk is naming the extraction in the wrong module, which the current port and port-mapped modules settle.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "refresh the ready web-search plan's file patch reference". In product/plans/ready/web-search.md, change both `product/plans/ready/file-patch.md` references to `product/plans/complete/file-patch.md` and rewrite the extraction sentence to say this pull request already moved the private `pasteRemote` body into `remotePaste` in src/file-navigator/remote/port-mapped.ts (not port-reads.ts) and that `remoteCreateItem` already existed, leaving port.ts below its max-lines limit, so the web-search change should skip that extraction and add only its own `webSearch`/`web-search` operation. Leave the tell and native-command count instruction's "whichever lands second adds one" logic intact, and do not edit port.ts, port-mapped.ts, or any code. Verify by reading both references in web-search.md and the shapes of src/file-navigator/remote/port.ts and port-mapped.ts.
