<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the ready web-search plan's stale reference to the file patch plan this change moved to complete.

Existing Issue: The ready web-search plan still points at the file patch plan in its old ready-folder location, which this pull request deleted, and still describes the remote port extraction it depends on as pending even though this pull request already moved the paste body into the port-mapped helper and the create-item helper already existed. Severity: 2/10

Existing Risk: 2/10 - A future web-search implementer follows a missing plan path or repeats an extraction this change already completed, which can produce a conflicting second helper and lost time.

Proposal Risk: 1/10 - A documentation-only correction; the only residual risk is naming the extraction in the wrong module, which the current port and port-mapped modules settle.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "refresh the ready web-search plan's file patch reference". In product/plans/ready/web-search.md, change both `product/plans/ready/file-patch.md` references to `product/plans/complete/file-patch.md` and rewrite the extraction sentence to say this pull request already moved the private `pasteRemote` body into `remotePaste` in src/file-navigator/remote/port-mapped.ts (not port-reads.ts) and that `remoteCreateItem` already existed, leaving port.ts below its max-lines limit, so the web-search change should skip that extraction and add only its own `webSearch`/`web-search` operation. Leave the tell and native-command count instruction's "whichever lands second adds one" logic intact, and do not edit port.ts, port-mapped.ts, or any code. Verify by reading both references in web-search.md and the shapes of src/file-navigator/remote/port.ts and port-mapped.ts.
