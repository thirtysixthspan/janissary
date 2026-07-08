# Fix spurious cwd/`__PWD_...__` lines leaking into queued command output

**Complexity: 5/10** — root cause is a race between two independent stdin/stdout round-trips on
the same shell process; fix serializes them per-shell rather than adding new architecture.

## Goal

After a queued command runs, its output was sometimes preceded by two spurious lines: the shell's
current working directory, followed by a `__PWD_<n>_<timestamp>__`-shaped marker line. These are
internal cwd-tracking artifacts and must never appear in the transcript.

## Background (verified)

- `src/shell.ts` has two independent stdin/stdout round-trip helpers on the same `ChildProcess`:
  `executeShellCmd` (writes `` `${command} 2>&1\necho "${prompt}"\n` ``, `prompt =
  "__JS_END_<index>_<timestamp>__"`) and `queryShellPwd` (writes `` `pwd\necho "${prompt}"\n` ``,
  `prompt = "__PWD_<index>_<timestamp>__"`). Each attaches its **own** `data` listener to the same
  `shell.stdout`/`shell.stderr` and removes it once its own marker is found in the accumulated
  buffer.
- `src/shell-manager.ts`'s `execute()` (pre-fix) called them back-to-back synchronously:
  `executeShellCommand(...)` → its completion callback calls `handlers.onDone(result)` then
  immediately `queryShellPwd(...)`, attaching a new listener without waiting for it to resolve.
- `run()`'s `onDone` calls `update(result, false)`, which calls `this.managers.tab.deleteBusy(label)`
  (`shell-manager.ts`). `TabManager.deleteBusy` (`tab-manager.ts:61-64`) schedules the queue-drain
  hook via `queueMicrotask`, not synchronously.
- The race: when command N finishes, its trailing `queryShellPwd` round-trip is started but not
  yet resolved (the shell hasn't executed `pwd` yet) when the microtask queue drains and
  `CommandManager.drainQueue` (`command-manager.ts`) dequeues and runs command N+1 — which
  immediately calls `execute()` → `executeShellCmd`, attaching **another** listener to the same
  `shell.stdout`/`shell.stderr` stream while N's pwd-query listener is still live. When the shell
  eventually emits the `pwd` output + its `__PWD_...__` marker, Node delivers that `data` event to
  **both** listeners: N's pwd-query listener correctly matches and resolves; N+1's fresh listener
  doesn't find *its own* marker in that chunk, so it treats the leaked text as in-progress output
  via `onProgress`/`onChunk`, permanently baking it into N+1's output buffer as a prefix.
- This only manifests for rapid-fire **queued** commands because the microtask-driven drain closes
  the gap between "previous command's pwd query starts" and "next command's execute call starts"
  to effectively zero — a directly-typed command has a real human-timescale gap in between, by
  which point the previous pwd query has long since resolved and removed its listener.
- No existing stripping/serialization layer exists at all — correctness depended entirely on each
  round-trip's listener never being concurrently active with another's, an invariant the
  microtask-timed drain loop broke.
- No `src/shell-manager.test.ts` existed before this fix; `src/command-manager.test.ts`'s queue
  tests mock `managers.shell` entirely, so they never exercised the real listener-interleaving
  behavior.

## Approach

Serialize each tab's shell interactions through a per-label `Promise` chain in `ShellManager`, so
a command's `executeShellCmd` **and** its trailing `queryShellPwd` round-trip must both fully
resolve (listeners detached) before the *next* queued command's `execute()` is allowed to write to
the same shell's stdin / attach its own listener.

## Implementation

1. **`src/shell-manager.ts`** — add a `private shellQueues = new Map<string, Promise<void>>()` to
   `ShellManager`, documented as serializing per-shell interactions for exactly this reason.
2. **`execute()`** — rewritten to chain onto the label's queue:
   ```ts
   private execute(label: string, command: string, index: number, cwd: string | undefined, handlers: RunHandlers): void {
     const shell = this.getShell(label, cwd);
     const previous = this.shellQueues.get(label) ?? Promise.resolve();
     const next = (async () => {
       await previous;
       await new Promise<void>((resolve) => {
         executeShellCommand(shell, command, index, handlers.onChunk, (result) => {
           handlers.onDone(result);
           queryShellPwd(shell, index, (pwd) => {
             if (pwd) handlers.onPwd(pwd);
             resolve();
           });
         });
       });
     })();
     this.shellQueues.set(label, next);
   }
   ```
3. **`getShell()`** — when respawning a dead shell (`!shell || !shell.stdin?.writable`), also
   `this.shellQueues.delete(label)` — a stale promise chain tied to the dead process's now-inert
   listeners must not block the fresh shell's first command forever.
4. **`close()`**/**`closeAll()`** — also delete/clear `shellQueues` entries so a later respawn on
   the same label doesn't inherit a stale chain.

Trade-off, called out in code comments: chaining onto `Promise.resolve().then(...)` means even the
*first* command on an otherwise-idle shell now has its actual `stdin.write` deferred by one
microtask tick versus the previous fully-synchronous call — imperceptible to a human, but worth
noting since it's a real (if negligible) timing change from before.

## Tests

New file **`src/shell-manager.test.ts`** — mocks `./shell.js`'s `spawnShell`/`executeShellCmd`/
`queryShellPwd` entirely (so the test drives the race deterministically without a real shell
process), using a real `TabManager` (matching `command-manager.test.ts`'s convention):

- `'does not start the next queued command until the previous command's pwd query resolves'` —
  runs `cmd1`, manually fires its `executeShellCmd` completion callback (triggering the trailing
  `queryShellPwd` call, left unresolved), then calls `run('cmd2')` and asserts
  `executeShellCmd` has **not** been called a second time yet; only after manually resolving
  `cmd1`'s pwd-query callback does `executeShellCmd` get called for `cmd2`.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual: not practically reproducible by hand (the
race requires near-zero gap between two rapid-fire queued commands) — the unit test above is the
primary verification; note as unverified manually beyond that.

## Out of scope

- `src/shell.ts`'s marker-matching logic itself (`executeShellCmd`/`queryShellPwd`) — unchanged,
  already correct when not raced.
- The `openInlinePty` full-tab interactive-takeover path — a different rendering path (a live
  embedded terminal, not a text transcript entry) with no equivalent race.
- Cross-tab interactions — each tab has its own shell and its own `shellQueues` entry; unaffected.
