# SSH tabs should be monitorable

**Complexity: 3/10** — one missing wiring call plus a small public method on an existing
class. `SshManager` already reuses the harness tab shape (`view: 'harness'`), so the monitor's
harness-feed already treats ssh tabs as harness targets; the only gap is that no
`HarnessScreenReader` is ever created for an ssh PTY, so `latestScreenText` always returns
`undefined` for them.

## Goal

`monitor <persona> <ssh-tab-label>` (or a group containing one) should see the ssh tab's
rendered terminal screen, refreshed on the monitor's periodic flush, exactly like a harness tab
today. This closes the gap called out in `product/specs/monitoring.md`: "SSH harness tabs have
no screen reader and remain unwatchable."

## Root cause

- `HarnessManager.spawnTab` (`src/harness/manager.ts:108-130`) is the only place that constructs
  a `HarnessScreenReader` and stores it in `this.screenReaders` keyed by PTY id.
- `SshManager.open` (`src/ssh-manager.ts:24-41`) builds an ssh tab with the same `HarnessView`
  shape (`view: 'harness'`, via `makeHarnessTab`) but spawns its PTY directly through
  `this.managers.pty.spawn(...)`, bypassing `HarnessManager` entirely — so no screen reader is
  ever registered for that PTY id.
- `HarnessManager.latestScreenText(label)` (`src/harness/manager.ts:38-42`) and
  `harnessFeedEntries` (`src/monitor/harness-feed.ts`) already work generically off
  `tab.harness.ptyId` and `tab.view === 'harness'` — they need no ssh-specific change. They just
  never find a reader for an ssh tab's PTY id today.
- Cleanup already works generically too: `HarnessManager`'s `messageBus.on('pty', 'exit', ...)`
  listener (`src/harness/manager.ts:25-32`) disposes and deletes whatever `screenReaders` entry
  matches `event.id`, regardless of how that entry was created.

## Approach

Add a small public method to `HarnessManager` that registers a screen reader for a PTY it did
not spawn itself, with no capture handler (ssh sessions need no auto-approve or busy-detection —
those are harness-specific concerns handled by `captureHandler`, which stays untouched). Call it
from `SshManager.open` right after the PTY is spawned.

## Implementation steps

1. **`src/harness/manager.ts`** — add a public method near `latestScreenText`:
   ```ts
   // Register a screen reader for a PTY this manager did not spawn itself (currently: ssh tabs,
   // which reuse the harness-view tab shape but spawn their PTY directly via SshManager). No
   // capture handler — auto-approve and busy detection are harness-specific and don't apply.
   registerScreenReader(id: string): void {
     const dims = this.managers.pty.spawnDimensions();
     this.screenReaders.set(id, new HarnessScreenReader(id, dims.cols, dims.rows));
   }
   ```
2. **`src/ssh-manager.ts`** — call it right after the PTY id is known, alongside the existing
   `liveTab.harness.ptyId = id` assignment:
   ```ts
   const id = this.managers.pty.spawn(label, 'ssh', command, cwd);
   this.managers.harness.registerScreenReader(id);
   const liveTab = this.managers.tab.tabs.find((t) => t.label === label);
   if (liveTab?.harness) liveTab.harness.ptyId = id;
   ```

## Tests

- **`src/harness/manager.test.ts`** — add a case verifying `registerScreenReader(id)` followed
  by feeding `pty` `data`/(time or flush) makes `latestScreenText` for a tab with that `ptyId`
  return the captured text, mirroring how existing tests in this file already exercise
  `latestScreenText` for a spawned harness tab.
- **`src/ssh-manager.test.ts`** (existing file, if present — otherwise colocate in
  `src/ssh-manager.ts`'s test file) — verify that opening an ssh tab calls
  `managers.harness.registerScreenReader` with the spawned PTY id.

## Out of scope

- Recording (`HarnessRecorder`) for ssh tabs — a separate feature (see
  `product/specs/harness-recording.md`), not part of "monitorable."
- Auto-approve / busy-status detection for ssh tabs — harness-specific, not requested by the
  issue.
- Changing `harnessFeedEntries` or `latestScreenText` — both already work correctly for any
  `view: 'harness'` tab once a screen reader is registered for its PTY id.

## Spec update

- **`product/specs/monitoring.md`** — remove the sentence "SSH harness tabs have no screen
  reader and remain unwatchable," since this closes that gap.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected server tests.
- Manual: not practical to drive an interactive ssh session and monitor in this environment;
  covered by the unit tests above instead.
