<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
