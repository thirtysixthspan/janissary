<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve ownership of borrowed workspaces when final removal fails.

Existing Issue: `WorkspaceManager.acquireAgentLease` marks its release closure as released and deletes the workspace from `refs` before `removeWorkspaceStrict` completes, so a removal error leaves the workspace on disk with no tracked reference and no retry path. Severity: 5/10

Existing Risk: 5/10 - A transient filesystem or untrust failure can leave an agent workspace and its contents behind indefinitely, while later cleanup cannot locate it through the manager.

Proposal Risk: 2/10 - Retrying or retaining failed removals keeps a reported cleanup failure recoverable, though an operating-system-level deletion failure can still leave data on disk until the next attempt succeeds.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "retain agent workspace ownership when final removal fails". In `src/workspace/manager.ts`, change the last-reference path in `WorkspaceManager.acquireAgentLease` so it does not permanently mark the lease released or discard the tracked directory until `removeWorkspaceStrict` succeeds. Keep the closure idempotent after successful release, and ensure a failed removal leaves enough state for cleanup to retry or for manager disposal to report and retry the orphan. Add focused cases in `src/workspace/manager.test.ts` where the first strict removal throws and a retry succeeds, verifying the workspace remains tracked between attempts and is removed from `refs` only after success. Preserve the existing borrowed-reference behavior when other users still hold the workspace.
