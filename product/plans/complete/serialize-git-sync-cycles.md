# Serialize shared Git sync cycles

Complexity: 4/10 (threshold: 7).

## Goal

Prevent opens, saves, and manual resyncs from running competing Git processes in the shared clone.

## Approach

An instance-owned promise queue holds a whole Git cycle, including abort recovery. Provisioning remains shared and starts synchronously as before. Every caller keeps its own result, and failures release the queue.

## Implementation steps

1. Add the queue to `src/git/sync.ts` and place `openSync` and `saveSync` operations inside it. Extend the subprocess fake and concurrency tests in `src/git/sync.test.ts`.
2. Update the syncing behavior in `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor-git-sync.md`. No help command changes are needed.
3. Complete the plan and remove the resolved backlog entry.

## Tests

Hold a pull pending and prove a second open waits. Hold a save's commit pending and prove another save and open wait until its push finishes. Fail a pull and hold abort pending, proving later work waits for recovery and still succeeds. Retain provisioning, branch, pathspec, error, and editor save tests. Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

Serializing editor filesystem writes, external Git processes, changing immediate save confirmation, automatic retries, and other backlog entries.
