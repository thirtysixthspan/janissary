# Preserve file-operation failure reasons

**Complexity: 6/10** — the change stays within the file-navigator feature, but it crosses the filesystem helpers, batch and replay bookkeeping, the shared RPC result, notification formatting, and the behavior documentation. No new subsystem or persistence is required.

## Goal

When a file-navigator move, copy, rename, delete, undo, or redo fails, keep the filesystem cause alongside the failed path and show an actionable reason in the single notification line instead of reducing every failure to an unnamed `false` or `undefined`.

## Approach

Introduce a small discriminated filesystem result and a pure error-to-user-reason mapper. The mapper recognizes common Node filesystem codes such as permission denial, a full disk, a cross-device move, a vanished path, an existing destination, and a read-only destination. Unknown failures get a safe generic recovery message rather than leaking an absolute path from Node's raw error text.

Keep `failedPaths` in `BatchResult` for the existing wire and client contract, and add an optional path-keyed `failureReasons` record. Successful results therefore keep their current shape. Batch, paste, replay, and single-item manager operations attach reasons only when failures occur. Logical rejections, such as an outside-root path or moving a directory inside itself, receive their own actionable reasons so a mixed batch never loses context.

The notification keeps its current count, selection-order naming, and three-name truncation. If every named failure has the same reason, append that reason once. If causes differ, append a compact path-to-reason list for the named failures.

## Implementation steps

1. Add a focused file-operation result module with the discriminated result type, safe error-code mapping, common logical failure reasons, and helpers for adding optional reason records to batch results.
2. Change `filesystem.ts` to return error-carrying results from move, copy, rename, and delete operations, preserving the original operation error when an overwrite restoration is attempted.
3. Thread reasons through `batch.ts`, `paste.ts`, `moves.ts`, `manager-batch.ts`, `manager.ts`, and the controller's undo/redo reporting path. Rename failures become a reported `BatchResult` like the other single-item operations.
4. Extend the shared file-navigator `BatchResult` contract with optional `failureReasons`, then update `operation-report.ts` to append one shared reason or per-item reasons to its existing notification text.
5. Update the file-navigator and notifications specs plus the existing public file-navigator guide where they document the notification line. `help.md` does not describe failure notifications, so it needs no change.

## Tests

- `src/file-navigator/file-operation-result.test.ts` covers the common Node error-code mappings and the safe fallback.
- `src/file-navigator/filesystem.test.ts` verifies failed move, copy, rename, and delete helpers carry a reason while successful operations retain their values.
- `src/file-navigator/batch.test.ts`, `paste.test.ts`, `manager-batch.test.ts`, and the existing manager/controller tests verify reasons survive each bookkeeping layer.
- `src/file-navigator/operation-report.test.ts` covers one shared reason, multiple per-item reasons, truncation, and notification delivery.

## Out of scope

- Retrying failed operations automatically.
- Changing conflict-confirmation behavior or treating skipped conflicts as failures.
- Persisting file-operation history or failure notifications.
- Exposing raw Node error messages or absolute paths in notification reasons.
- Changing the client dialogs or the structure of `conflictPaths`, `conflict`, or `conflicts` results.
