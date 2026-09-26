# Start and finish a shell command's transcript entry through the shared running-entry path

**Complexity: 4/10** — one producer (`ShellManager.run` in `src/shell/manager.ts`) switches to helpers that already exist, and the shared start (`TabManager.startRunning` → `startRunningTab` in `src/tab/transcript-events.ts`) gains one optional parameter. No new architecture and no wire changes.

Every other long-running command opens its transcript entry with `TabManager.startRunning` and closes it through `updateRunningEntry`'s hooks, but `ShellManager.run` hand-writes the same steps: it assigns `tab.log` directly, re-implements the cap-and-trim against `transcriptMaxLines`, emits `entries:trimmed` and `entry:appended` itself, sets busy and emits `dirty`, and after the command finishes re-emits the trailing output `entry:appended` by hand. The copy has already drifted from the shared one. It never resets `scrollOffset`, so a scrolled-up transcript does not follow a newly typed shell command, and it never marks an inactive tab unread when a command starts there.

## Goal

A shell command's transcript entry is started by the same code as every other producer's, and finished through the same `updateRunningEntry` hooks, including the shared trailing output event. The start entry keeps its `cwd`, and a command promoted to a terminal still finishes reading `(ran in terminal)` with no trailing output event.

## Approach

1. Give the shared start an optional extra-fields argument. `startRunningTab(tabsOrBusy, label, input, append, fields?)` appends `{ input, output: '', running: true, ...fields }`, where `fields` is the non-core part of a `LogEntry` (everything but `input`, `output`, and `running`). `transcriptOperations.startRunning` and `TabManager.startRunning(label, input, fields?)` pass it through. Existing callers pass nothing and are unchanged.
2. In `ShellManager.run`, replace the hand-written log write, trim, bus emits, `addBusy`, and `dirty` emit with `this.managers.tab.startRunning(label, command, { cwd })`. The shared path sets busy, appends through `TabManager.append` (cap, `scrollOffset` reset, `entries:trimmed`, `entry:appended`, unread marking, `dirty`).
3. Replace the manual trailing emit and the separate `markUnread` call in `onDone` with the shared hooks: the finishing `update` passes `markUnread` and `trailing: !promoted`, so a normal finish emits exactly one trailing output event (only when the output is non-empty, as before) and a promoted finish emits none.

The `cwd` the start entry carries, and the entry object the transcript logger and store receive on `entry:appended`, are unchanged.

## Implementation steps

1. Add the `fields` parameter to `startRunningTab` (`src/tab/transcript-events.ts`), `startRunning` (`src/tab/transcript-operations.ts`), and `TabManager.startRunning` (`src/tab/manager.ts`).
2. Write the new `ShellManager` bus-event tests first (below) against the current code, then rewrite the start and finish in `ShellManager.run` (`src/shell/manager.ts`).
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/tab/transcript-events.test.ts`: `startRunningTab` merges extra fields (e.g. `cwd`) into the appended running entry.
- `src/shell/manager.test.ts`, a new "transcript events" block with a real `TabManager` subscribed to the `transcript` bus:
  - running and finishing an ordinary command emits exactly one `entry:appended` for the start (the running entry, carrying `cwd`) and exactly one trailing output event (`{ input: '', output: <result> }`);
  - a promoted command emits the start event and no trailing output event, and its entry reads `(ran in terminal)`;
  - starting a command returns a scrolled-up transcript to the bottom (`scrollOffset` reset to 0);
  - starting a command in an inactive tab marks it unread;
  - the start respects `transcriptMaxLines`, emitting `entries:trimmed` when the log is full.

## Out of scope

- The other `ShellManager` log writers (restored remote output and history), which already go through `TabManager.append`.
- Changing how `updateRunningEntry` matches the running entry, or the finalize hook (busy clearing and persistence) the shell already passes.
- Any change to the transcript logger, the store, or persistence.

## Specs and docs

- `product/specs/transcript.md` ("Auto-scroll on output"): starting a command, a shell command included, returns the view to the bottom.
- `product/specs/tabs.md` ("Unread badge"): starting a command in an inactive tab marks it, for shell commands the same as browser and connection commands.
- No `help.md` or user-documentation change: neither describes scroll behavior on a command's start, and the user docs' unread examples stay accurate.
