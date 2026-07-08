# Show "Queued: &lt;command&gt;" in the transcript when a command is queued

**Complexity: 2/10** — one new `append` call at an existing gate seam in `command-manager.ts`,
plus a spec line and a couple of test assertions.

## Goal

When a command gets queued (the issuing tab is busy, or idle but already has entries waiting),
its transcript should immediately show `Queued: <command>`, so the user gets visible confirmation
the command was accepted rather than silently dropped into the queue.

## Background (verified)

- `src/command-manager.ts:50-62` (`dispatchOrRun`) is the single gate seam where a command either
  runs immediately or gets queued. The queuing branch (lines 56-59):
  ```ts
  if (isAgentTab && (!wasIdle || alreadyQueued)) {
    this.managers.tab.enqueue(label, trimmed);
    if (wasIdle) this.drainQueue(label);
    return;
  }
  ```
  currently appends **nothing** to the transcript — confirmed by
  `src/command-manager.test.ts:34-45` (`'queues submissions while the tab is busy...'`), which
  only sees the pre-existing `'before'` log entry, and by `TabManager.enqueue`
  (`src/tab-manager.ts:76-79`), which just pushes onto the queue `Map` with no `append` call.
- Convention for a system/status-only transcript line (no command echo, just an output message)
  is `this.managers.tab.append(label, { input: '', output: <message> })` — used the same way at
  `src/acp-manager.ts:97,115`, `src/harness-manager.ts:74`, and elsewhere in
  `command-manager.ts` itself (lines 80, 86, for run-time errors).
- This is **not** the same as the existing `→ <label> (queued): <command>` line
  (`src/commands/enqueue.ts:30`) — that fires for the cross-agent `enqueue <agent> <command>`
  command, a different, already-correct path that must not be touched or duplicated.
- `specs/agent-command-queue.md` documents the queue mechanics, the `queue ❯` prompt/blinking-dot
  indicator, and the Cmd+E popup, but says nothing about a transcript line appearing when a
  same-tab command is queued while busy — this fix adds that documentation.

## Approach

Add one `append` call in the queuing branch of `dispatchOrRun`, right after `enqueue`.

## Implementation

1. **`src/command-manager.ts:56-59`** — change
   ```ts
   if (isAgentTab && (!wasIdle || alreadyQueued)) {
     this.managers.tab.enqueue(label, trimmed);
     if (wasIdle) this.drainQueue(label);
     return;
   }
   ```
   to
   ```ts
   if (isAgentTab && (!wasIdle || alreadyQueued)) {
     this.managers.tab.enqueue(label, trimmed);
     this.managers.tab.append(label, { input: '', output: `Queued: ${trimmed}` });
     if (wasIdle) this.drainQueue(label);
     return;
   }
   ```
2. **`specs/agent-command-queue.md`** — add a line to the "Queueing and draining" section noting
   that a queued submission appends a `Queued: <command>` line to the issuing tab's transcript.

## Tests

Extend `src/command-manager.test.ts`, `describe('CommandManager queue gate', ...)`:

1. `'queues submissions while the tab is busy, and does not queue empty input'` (existing, line
   34) — add an assertion that `managers.tab.cur().log` contains a `Queued: clear` output entry
   after the busy `dispatch('clear')` call.
2. `'queues two commands in FIFO order while busy, then drains the first after deleteBusy'`
   (existing, line 47) — add assertions that the log contains `Queued: clear` and
   `Queued: shell echo hi` entries (in order) after both dispatches, before `deleteBusy` drains
   the queue.
3. New test `'appends a Queued: line for a submission that queues behind an idle tab's existing
   queue'` — covers the "idle but already queued" branch. Pre-load the queue with `state` (not
   `clear` — `clear` wipes the transcript when it later runs during the drain, which would erase
   the very `Queued:` line being asserted, since this branch drains synchronously within the same
   `dispatch` call), then dispatch a second command and assert the log contains its `Queued:`
   line. A separate new test rather than extending the existing
   `'dispatch into an idle tab with a non-empty queue...'` test, to avoid that same `clear`
   interaction.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: run the app, make a tab busy (e.g. a long
shell command), submit another command, and confirm `Queued: <command>` appears in the
transcript immediately. Not runnable in this environment — note as unverified manually if so.

## Out of scope

- The cross-agent `enqueue <agent> <command>` command and its existing
  `→ <label> (queued): <command>` transcript line (`src/commands/enqueue.ts`) — unrelated,
  already correct.
- The `queue ❯` prompt / blinking dot indicator and the Cmd+E queue popup — unchanged, already
  implemented.
- Any change to drain/run behavior itself.
