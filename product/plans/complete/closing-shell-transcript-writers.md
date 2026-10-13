# Keep closing shell transcript writers owned until settled

## Complexity

6/10. The work changes one manager's writer lifecycle and focused tests. The asynchronous exit, release, reinstall, and shutdown paths need coordinated ownership, but the writer already exposes an idempotent completion promise.

## Goal

Keep a shell transcript protected from save or rename until its final parsed rows and stream close have settled. Shutdown waits for already-closing writers as well as active ones, within its existing deadline.

## Approach

Track closing writers separately from active PTY entries, retaining each writer's open path and the promise returned by its idempotent `dispose`. Move writers into that set on PTY exit, tab release, reinstall, and manager shutdown. Keep `isWriting` aware of active and closing entries, and include all outstanding finishing promises in the bounded shutdown wait. Preserve released-writer and tab-failure ownership rules.

## Implementation steps

1. Add closing-writer ownership and a common release path in `ShellTranscriptManager`.
2. Update lifecycle tests for protection through finalization and shutdown waiting with no active entries; add a held-finalization case followed immediately by manager disposal.
3. Clarify transcript draining after PTY exit or tab close in `product/specs/shell-tab.md`.

## Tests

- PTY exit and tab close keep `isWriting` true until writer completion, then release the guard.
- Closing writers remain failure-notification safe under tab close, reinstall, and label reuse.
- Manager disposal waits on closing writers even when the active map is empty, but still respects the one-second deadline.
- Existing writer final-row, once-only finishing, and editor save-refusal tests continue to pass.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Extending the existing shutdown deadline or changing writer parsing, notification, save, or rename behavior.
