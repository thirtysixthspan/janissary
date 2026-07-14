# Fix: closing a workspaced (harness) tab blocks the UI

**Complexity: 2/10** — a one-line-of-behavior change in `src/tab-cleanup.ts`: defer the workspace clone's removal off the synchronous close path. No change to the close ordering, the PTY teardown, or any other tab type's behavior; one existing unit test is updated and one new assertion is added.

## Goal

Closing a harness tab that was launched with `-w`/`--workspace` freezes the UI for a moment. The tab appears stuck until the freeze clears, instead of closing immediately.

## Approach

When a tab closes, `closeTabResources` (`src/tab-cleanup.ts`) tears down every per-tab resource synchronously, then `tab-manager.closeTab` removes the tab from the view and broadcasts the new state. One of those teardown steps — `managers.workspace.remove(tab.workspaceDir)` — is a **synchronous `rmSync` of the entire workspace git clone** (`removeWorkspace` in `workspace.ts`). For a harness `-w` tab that clone contains a full checkout (`.git`, `node_modules`, …), so the recursive delete blocks Node's single-threaded event loop long enough to freeze the UI — the tab can't visibly close until the delete finishes.

The harness process itself is **not** the blocker: `pty.kill()` only sends a signal and returns immediately. The fix is to move the one slow step — the workspace removal — off the synchronous close path so the tab closes and the state broadcast reaches the client first, and the clone is deleted in the background.

The clone stays tracked by `WorkspaceManager` until the deferred `remove()` runs (which is what un-tracks it), so if the app shuts down before the background delete fires, `WorkspaceManager.removeAll()` still cleans it up — no leak. `removeWorkspace` is already idempotent (`rmSync(..., { force: true })`), so a background delete overlapping shutdown cleanup is harmless.

This is deliberately the *minimal* change: only workspaced tabs are affected (a tab with no `workspaceDir` never called `workspace.remove` at all), and every other teardown step stays exactly where it is, so nothing that runs synchronously today changes order.

## Implementation steps

1. In `src/tab-cleanup.ts`, replace the inline `if (tab.workspaceDir) managers.workspace.remove(tab.workspaceDir);` with a deferred call: capture the dir and schedule `managers.workspace.remove(dir)` via `setTimeout(…, 0)` (matching the codebase's existing deferral style), with a comment explaining why.
2. Run `./scripts/run.mjs check-diff`.

## Tests (`src/tab-cleanup.test.ts`)

- Update the existing "removes the workspace clone only when the tab has one" test: a plain tab still never calls `workspace.remove`; a workspaced tab does **not** call it synchronously, but **does** call it (with the right dir) after the deferral fires (`await` a macrotask tick). Rename to reflect the background behavior.
- Confirm the rest of the teardown (`pty.closeTab`, `shell.close`, `tab:removed`, etc.) still runs synchronously — the existing "closes every per-tab resource" and "emits a tab:removed transcript event" tests already assert this and must keep passing unchanged.

## Out of scope

- Reordering `tab-manager.closeTab` (removing the tab from the view before teardown) — unnecessary once the only slow step is backgrounded; the remaining teardown is all fast (signal-send kill + in-memory map deletes).
- Making the PTY kill asynchronous — it is already non-blocking.
- Any change to `WorkspaceManager` / `removeWorkspace` internals or to shutdown (`removeAll`) behavior.
- Non-workspaced tab closes — they have no workspace to remove and were never the source of the freeze.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: launch `harness claude -w`, let it clone a sizeable repo, then close the tab — it disappears immediately instead of freezing while the clone is deleted. Not runnable headless here; covered by the deferred-removal unit test.
