# Recognize claude code busy/ready status from captures

## Summary

Today a harness tab's dot blinks (`tab.busy`) for the entire lifetime of the process — `addBusy` runs once at spawn and is never cleared until the harness exits, so the blinking dot doesn't actually mean "thinking right now." This feature makes the blinking dot accurate for the claude harness by recognizing, from the same rendered-screen captures auto-approve already reads (`HarnessScreenReader`/`ScreenCapture`), whether claude is actively generating ("busy") or sitting idle at its own prompt ("ready"), and calling `addBusy`/`deleteBusy` accordingly. The detection table is structured per-harness from the start (mirroring the existing permission-gate table's shape), so other harnesses can get their own detectors later without restructuring, even though only claude gets a real detector in this pass.

## Design decisions

1. **Detection signal.** The exact capture-text pattern(s) that distinguish claude "busy" (actively generating, e.g. a spinner/status line) from "ready" (sitting at its own empty prompt) are determined from real captures during implementation, the same way the existing permission-gate patterns in `auto-approve.ts` were originally captured and encoded — the plan does not hardcode literal text now.
2. **Harness scope.** The detector is a per-harness table from day one (same shape as `GATE_TABLE` in `auto-approve.ts`), so a harness with no entry falls back to today's coarse behavior (busy for the whole process lifetime). Only claude gets a real detector in this pass; opencode/codex are later work, consistent with how the gate table is scoped today.
3. **Interaction with the permission gate.** While claude is showing its permission-gate prompt, the tab's dot stops blinking (claude itself is idle, blocked on the user, not doing work) — but if the gate is not auto-approved, the tab's unread badge is set (via the existing `markUnread`) to call the user's attention to it, the same way an unread badge already flags other tab activity needing attention.
4. **Initial state.** A harness tab starts "busy" (blinking) immediately on spawn, exactly as today, until the first screen capture is read and classified — avoiding a flash of "ready" before the process has produced any output yet.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `HarnessScreenReader` / `ScreenCapture` | `src/harness/screen.ts` | Already reads and debounces the harness's rendered screen text on every PTY flush; the new busy/ready detector consumes the same `onCapture` callback auto-approve already uses — no new capture mechanism needed. |
| `GATE_TABLE` / `detectPermissionGate` / `detectClaudeGate` | `src/harness/auto-approve.ts` | Direct structural precedent: a per-harness table of `{ detect: (text) => boolean }` entries, keyed by harness name, with claude the only populated entry. The new busy/ready table follows the identical shape. |
| `HarnessAutoApprover` / `autoApproveHandler` | `src/harness/auto-approve.ts`, `src/harness/manager.ts` (`autoApproveHandler`) | Shows exactly how a capture-driven per-harness detector is wired into `HarnessScreenReader`'s constructor callback in `spawnTab` — the new busy/ready watcher is wired the same way, as a sibling callback (or folded into the same callback chain) rather than a new capture-reading mechanism. |
| `Managers.tab.addBusy` / `deleteBusy` | `src/tab/manager.ts` | The existing busy-set mechanics that already drive the blinking dot (`tab.busy` → `.dot.busy` CSS animation in `theme.css`); the new detector calls these directly instead of introducing a new status field. |
| `markUnread` | `src/tab/manager.ts` | Existing unread-badge mechanism reused to flag an un-auto-approved gate needing user attention. |
| `HarnessView.status` (`'running' \| 'exited'`) | `src/types.ts` | The existing coarse process-level status is untouched — busy/ready is a separate, finer-grained signal layered on top via the tab's existing `busy` set, not a new value on this field. |

## Proposed changes

1. **New per-harness busy/ready table** (e.g. `src/harness/busy-status.ts`, mirroring `auto-approve.ts`'s shape): a `BUSY_TABLE: Record<string, { busy: (text: string) => boolean }>` (or equivalent), with a `detectBusy(text, harnessName): boolean` export that looks up the harness's entry and falls back to a value meaning "no real detector — keep existing coarse behavior" for any harness without one. The claude entry's `busy` function is authored against real captured screen text gathered during implementation (per decision 1).
2. **Wiring into capture handling** (`src/harness/manager.ts`, near `autoApproveHandler`/`spawnTab`): the harness screen reader's `onCapture` path gains a second consumer (alongside the existing auto-approve handler) that, for a harness with a real busy-table entry: calls `deleteBusy(label)` when the capture is classified "ready" or is a detected permission gate, and calls `addBusy(label)` when the capture is classified "busy" and no gate is showing. For a harness with no table entry, behavior is unchanged (busy stays set from spawn until exit).
3. **Gate + unread interaction**: when a permission gate is detected and NOT immediately auto-approved (i.e. `autoApprove` is off, or the auto-approver reports "stuck"), the same capture-handling path calls `markUnread(label)` in addition to clearing busy, so the tab's badge signals the pending gate.
4. **`spec/harness.md` (or wherever harness tab status/blinking is documented)**: add a section describing claude-specific busy/ready recognition, its interaction with the permission gate and the unread badge, and that other harnesses keep the existing coarse (spawn-to-exit) busy behavior until they get their own detector.

## Tests

- `src/harness/busy-status.test.ts` (new): the claude busy/ready detector correctly classifies captured fixture text as busy vs ready (fixtures authored from real captures gathered during implementation); a harness with no table entry (e.g. opencode) always reports "no real detector" regardless of input text.
- `src/harness/manager.test.ts`: a capture classified "ready" for a claude tab clears its busy state (asserted via `managers.tab.busy`/`tab.busy`); a capture classified "busy" (re-)sets it; a detected-but-not-approved permission gate clears busy and marks the tab unread; a harness with no detector entry keeps busy set across captures exactly as before this change.
- Existing `src/harness/auto-approve.test.ts` continues to pass unchanged — the gate detector itself isn't modified, only consumed by a second capture handler.

## Out of scope

- Real detectors for opencode/codex — the table exists for all harnesses structurally, but only claude gets an actual detector in this pass.
- Any change to `HarnessView.status` (`'running'`/`'exited'`) or the process-exit lifecycle.
- Any change to the permission-gate detector or auto-approve keystroke logic itself.
- A visually distinct "gate pending" indicator beyond the existing unread badge (e.g. a third dot color or icon) — the badge is the only new signal for this case.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: launch `harness claude`, submit a prompt, and confirm the tab's dot blinks while claude is visibly generating and stops blinking once claude returns to its own idle prompt. Trigger a tool call that raises claude's permission gate without auto-approve enabled, and confirm the dot stops blinking and the tab's unread badge appears; switch away and back to clear the badge, then confirm approving the gate resumes normal busy/ready tracking. Repeat with `harness opencode` and confirm its dot still blinks for the whole process lifetime (unchanged, coarse behavior).
