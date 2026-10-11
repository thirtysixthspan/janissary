# Bound Git sync commands and cancel queued work during shutdown

**Complexity: 8/10** — bounded execution and cancellation span the shared sync queue, branch discovery, subprocess recovery, and shutdown. Proceeding under the user's complexity override.

## Goal

Ensure every subprocess in a Git sync cycle has a finite deadline, active work is terminated during shutdown, and queued cycles settle without launching more commands.

## Approach

Add an owned Git subprocess runner that applies command deadlines, tracks the active child, and exposes cancellation. Route branch discovery and all cycle commands through it. Give failed rebase recovery its own fresh bounded command, distinguish `git diff --cached --quiet`'s expected change exit from timeout or command failure, and make `GitSync.dispose()` idempotently stop the queue.

## Implementation steps

1. Introduce the bounded subprocess runner and thread its execution options into Git status branch readers.
2. Route staging, diff, commit, pull, rebase abort, and push through the runner; settle timeout and cancellation only after the child stops.
3. Add idempotent shutdown behavior that cancels active work and prevents queued cycles from starting.
4. Extend sync tests for deadlines, recovery ordering, queue cancellation, and failed diff behavior; update the sync spec if needed.

## Verification

Run `./scripts/run.mjs check-diff` after implementation changes. Keep the existing stale-save integration test passing.

## Completion

Added a bounded Git command runner with a 60-second deadline and shutdown cancellation. Branch discovery and all save/open commands use it, and failed pulls run bounded abort recovery with a fresh signal. Git sync now treats only diff exit code 1 as a staged-change result. Queue and error-path tests pass with `./scripts/run.mjs check-diff`.
