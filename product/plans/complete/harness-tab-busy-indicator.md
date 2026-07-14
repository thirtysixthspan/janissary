# Harness tabs show as busy while their process is alive

**Complexity: 2/10** — one `addBusy` call at harness spawn, one `deleteBusy` call in the
shared tab-close cleanup path; no new mechanism, no per-harness logic.

## Goal

The tab-strip dot indicator for a harness tab (`harness <name>` → `claude`/`opencode`/`codex`)
always reads as idle: the live `busy` flag pushed to the client (`TabView.busy`,
`src/protocol.ts:35`) is `this.busy.has(t.label)` (`src/tab-manager.ts:354`), and nothing ever
calls `addBusy` for a harness tab's label. This is a real, misleading gap — a harness tab is an
embedded AI CLI running continuously; its dot should read as active for as long as that process
is alive, the same way the codebase already treats a running shell command or ACP turn as busy
(`src/shell-manager.ts:80-91`, `src/acp-manager.ts:109-119`).

This plan intentionally does **not** attempt to distinguish "the harness is thinking" from
"the harness is idle, waiting on input" — that would require parsing each harness's own
terminal output (spinners, prompts), which differs per CLI and is real, separate, larger work
(tracked as the remaining, harder part of `plans/small-issues.md`'s harness-status entry). This
plan only fixes the coarser, currently-wrong signal: busy vs. "no harness process running at
all."

## Background (verified)

- `src/harness-manager.ts:60-76` `spawnTab` creates the tab (`insertTabInGroup`), focuses it,
  and spawns the PTY — it never calls `this.managers.tab.addBusy(label)`.
- `src/tab-manager.ts:57-66`: `addBusy`/`deleteBusy` toggle a `Set<string>` keyed by tab label;
  `isBusy`/`view()` (`tab-manager.ts:354`) read it for the client-visible `busy` flag.
- `src/controller.ts:60-69`: on a harness PTY's `exit` event, the tab is closed immediately via
  `this.managers.tab.closeTab(harnessIndex)` — there is no intermediate "exited but still open"
  state to worry about for the busy flag.
- `src/tab-cleanup.ts` (`closeTabResources`, called from `TabManager.closeTab`) tears down every
  other per-tab manager (shell, acp, browser, pty, fileTree, editorWatch, schedule, database) but
  never clears the `busy` set entry for the closed tab's label — a latent gap for **any** tab
  type (not just harness) closed while busy. Since harness tabs will now go busy on every spawn,
  this gap needs closing here too, or `TabManager.busy` accumulates a stale entry per closed
  harness tab for the lifetime of the process.
- `HarnessView.status` (`src/types.ts:59`, `'running' | 'exited'`) is a separate, pre-existing
  field checked by `src/schedule-manager.ts:87`. It is out of scope here — this plan only touches
  the `TabManager.busy` set / `TabView.busy` flag, not `HarnessView.status`.

## Implementation

1. **`src/harness-manager.ts`** — in `spawnTab` (around `this.managers.tab.insertTabInGroup(tab);`),
   add `this.managers.tab.addBusy(label);` right after the tab is inserted (before or after
   `activeTab`/`findIndex` — order doesn't matter, both run synchronously before the client is
   notified via `messageBus.emit('state', { type: 'dirty' })` at the end of the function).
2. **`src/tab-cleanup.ts`** — in `closeTabResources`, add `managers.tab.deleteBusy(tab.label);`
   alongside the other per-manager teardown calls (e.g. next to `managers.pty.closeTab(tab.label);`).
   This clears busy state on any tab close (harness or otherwise), not just the harness path.

## Tests

Mirror the existing style in `src/controller.test.ts`'s `describe('Controller harness view', ...)`
block (uses the mocked `spawnPty`/`capturedHandlers` already set up in that block's `beforeEach`):

- `src/controller.test.ts`: add `it('harness claude opens with the tab marked busy', ...)` —
  dispatch `harness claude`, assert `c.view().find((t) => t.label === 'claude')!.busy` is `true`.
- `src/controller.test.ts`: add `it('closing a harness tab clears its busy flag', ...)` — dispatch
  `harness claude`, `c.closeTab(index)` (as the existing "closing a harness tab kills its PTY"
  test does), then assert `c.managers.tab.isBusy('claude')` is `false`.
- `src/tab-cleanup.test.ts`: **verified** — `makeManagers()` (`tab-cleanup.test.ts:7-19`) mocks
  each manager as a plain object of `vi.fn()`s and does not currently include a `tab` key at all;
  add `tab: { deleteBusy: vi.fn() }` to that object, then add a test alongside the existing
  `'closes every per-tab resource...'` case asserting `expect(managers.tab.deleteBusy).toHaveBeenCalledWith('main');`
  after calling `closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2)`.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Manual (not runnable in this sandbox — note as unverified): run `janus`, `harness claude`,
  confirm the new tab's dot renders in the "busy" (active) state immediately, then quit the
  harness process and confirm the tab closes and no dot artifact remains.

## Out of scope

- Per-harness busy/idle detection via terminal-output parsing (the harder, deferred part of the
  original `plans/small-issues.md` entry).
- `HarnessView.status` (`'running' | 'exited'`) — untouched, remains as today.
- Any change to `ssh` tabs, which reuse `HarnessView` (`name === 'ssh'`) — **verified**:
  `src/ssh-manager.ts:32-38` has its own separate spawn path (mirrors, but does not call,
  `HarnessManager.spawnTab`), so it does not inherit this fix. `ssh` is a remote shell, not an
  AI coding harness, and the original `plans/small-issues.md` entry is scoped to the latter — left
  untouched here.
