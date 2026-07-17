# Fix: duplicate "with"-prompt carriage-return entry in the backlog

**Complexity: 1/10** — no source, test, or spec changes; this is a stale backlog entry, not an open bug.

## Goal

`product/backlog/issues.md` lists: "injecting a command into the harness using the 'with' parameter should execute the command in the harness, so needs to include a carriage return at the end of the command."

This describes behavior that was already implemented by `feat(harness): inject a launch prompt via a with clause (#419)`, whose plan lives at `product/plans/complete/scheduled-harness-with-task.md`. The issue was filed by a `chore: planning` commit (`a7f80f8`) eight minutes *after* #419 merged (`9e8ccc3`), so it reports a gap that no longer exists.

## Approach

Verified the described behavior against the current code:

- `parseHarnessCommand` (`src/harness/index.ts`) splits a trailing `with <prompt>` clause and threads it through as `prompt`.
- `HarnessManager.open` (`src/harness/manager.ts:123`) attaches a one-shot `ScheduleEntry` carrying the prompt to the new tab via `oneShotRunEntry`.
- `ScheduleManager.fire` (`src/schedule/manager.ts:102-117`) delivers a due harness-tab entry by writing the command text to the PTY, then writing a **separate `\r`** 50ms later (`this.managers.pty.input(ptyId, e.command); setTimeout(() => this.managers.pty.input(ptyId, '\r'), 50);`) — the comment there explains why the carriage return is split into its own write (so the harness's paste-detection doesn't swallow it as inserted text rather than submit).

This is exactly the carriage-return behavior the issue asks for, and it is covered by existing tests: `src/schedule/manager.test.ts`'s "delivers a one-shot prompt to the running harness PTY, then drops it" test asserts `input` is called with the command and then, 50ms later, with `'\r'`. `src/harness/manager.test.ts` and `src/harness/index.test.ts` cover the parsing and wiring. `product/specs/harness.md`'s "Launch prompt" subsection and `product/specs/scheduling.md`'s "Scheduling a harness launch with a prompt" subsection document it. Nothing is left to implement.

## Implementation steps

1. Remove the duplicate line from `product/backlog/issues.md` (the only change this fix makes).

## Tests

None — no behavior changes; `src/schedule/manager.test.ts`, `src/harness/manager.test.ts`, and `src/harness/index.test.ts` already cover the described behavior.

## Out of scope

- Any change to `src/harness/index.ts`, `src/harness/manager.ts`, `src/schedule/manager.ts`, or `src/profile/harness-schedule.ts` — all already implement the requested behavior.
- Any change to `product/specs/harness.md` or `product/specs/scheduling.md` — already documents this behavior.

## Verification

`./scripts/run.mjs check-diff` passes (no source changes are made, so this is a no-op check). No manual verification needed since no behavior changes.
