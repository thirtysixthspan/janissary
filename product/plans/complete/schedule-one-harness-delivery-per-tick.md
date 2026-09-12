# Separate simultaneously due harness commands into distinct scheduled submissions

## Complexity

6/10 — a delivery-budget change inside the scheduler's firing loop with new multi-entry, multi-tab, and mixed-recurring test coverage; the text-then-delayed-Enter behavior and every existing case stay as they are.

## Goal

The scheduler treats a harness command as delivered when its text is written, although submission occurs in a later 50 ms timeout. Two entries due on the same tick write both command strings before either delayed Enter, so the harness can receive one concatenated prompt followed by an empty submission while both schedule entries are counted as fired.

## Approach

In `src/schedule/manager.ts`, change `ScheduleManager.fireDue` to accept at most one successfully delivered entry per harness tab per tick and retain the other due entries unchanged for subsequent ticks; leave agent-tab dispatch and recurring-entry rescheduling unchanged. This is a bounded first increment that uses the existing one-second tick rather than introducing a second command queue or another label-keyed state map. Preserve the text-then-delayed-Enter behavior in `fire`, the readiness check, and notification emission only for the entry actually accepted. (`src/pseudoterminal-manager.ts` forwards each `input` directly to `session.write` and supplies no submission serialization, so the guard belongs before those calls — which is where `fireDue` sits.)

Concretely: `fireDue` gains a per-tick delivery budget of one for harness tabs (unbounded for agent tabs, whose dispatch is synchronous and unchanged). Once the budget is spent, every further entry — due or not, recurring or one-shot — is retained unchanged, so a second due recurring entry is neither fired nor rescheduled this tick.

## Implementation

1. Add the budget to `fireDue` in `src/schedule/manager.ts`.
2. Extend `src/schedule/manager.test.ts` with the cases below.
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

Extend `src/schedule/manager.test.ts` (whose harness cases each install only one entry today):

- two distinct due one-shots on one harness tab: the first tick delivers only the first command, the second entry is retained, and the next tick delivers it — asserting exact input order across successive ticks and one notification per accepted command;
- mixed recurring and one-shot entries due together: the first due entry fires (and, if recurring, reschedules), the other is retained unchanged with its original `nextRun`;
- separate harness tabs each submit during the same tick — the budget is per tab, not global;
- agent tabs retain their existing multi-entry behavior: two due entries on one agent tab both dispatch in one tick.

The current tests cover readiness retries and the 50 ms Enter delay; keep those assertions and keep `src/schedule/index.test.ts` passing.

## Out of scope

- A second command queue or label-keyed submission state.
- The 50 ms Enter delay itself, or guarding against a user typing into the terminal during that interval.
