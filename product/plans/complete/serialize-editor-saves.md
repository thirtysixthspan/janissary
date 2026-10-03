# Serialize editor saves

Complexity: 6/10 (threshold: 7).

## Goal

Prevent overlapping save actions from conflicting with the editor's own previous write, while preserving error, overwrite, and save-before-close behavior.

## Approach

Create a coordinator owned by each mounted editor that stores the acknowledged baseline and admits one write at a time. Identical adjacent requests share completion; changed snapshots wait and use the preceding successful baseline. A failed write rejects its waiting callers without leaving the queue blocked. Loaded and externally reloaded content update the same baseline. All save entry points, including explicit overwrites, use this coordinator.

## Implementation steps

1. Add `web/src/editor/save-coordinator.ts` and focused tests. Wire it into `web/src/editor/useEditorFile.ts`, keeping the latest writer callback available to queued requests and passing baseline updates through one setter. Add deferred-response hook tests for overlapping actions, failures, overwrite handling, dirty tracking, and refreshed baselines. Run `./scripts/run.mjs check-diff`.
2. Update the saving section in `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor.md`. The help shortcut remains accurate. Move the search worker proposal to deferred with complexity 8/10 because it introduces a worker execution and lifecycle boundary across source and compiled runtimes. Remove the resolved save entry and promote this plan. Run `./scripts/run.mjs check-diff`.
3. Ship through `ai/tasks/workspace/merge-change-to-master.md`.

## Tests

Verify identical pending saves produce one write and share success; changed snapshots wait and receive the newly acknowledged hash; failure rejects queued callers and a later retry works; explicit overwrite bypasses the hash only for that request; a nonadjacent return to earlier text remains ordered. At hook level verify repeated actions and a dirty-handle-style save caller await one write, newer unsaved edits remain dirty, initial and watched loads update the baseline, conflict rejects pending callers, and overwrite recovers. Retain close-guard cancellation and failure tests and commit-after-save ordering tests.

## Out of scope

Cross-client write arbitration, remote host conflict detection, generic RPC replay, search worker implementation, and draft reconnection recovery. Add narrow lint comments at the promise constructors explaining why the web project's ES2023 library requires the existing constructor API instead of `Promise.withResolvers`.
