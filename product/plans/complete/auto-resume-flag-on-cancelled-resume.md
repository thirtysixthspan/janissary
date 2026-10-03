# Return the auto-resume flag to plain when the user cancels the pending resume

**Complexity: 2/10** — one optional callback added to a scheduler method that already has a callback for the other outcome, one call site, and the flag setter it already calls. No new subsystem, no new protocol shape, no behavior change outside a cancelled resume.

## Problem

`ScheduleManager.add` lets a caller that appends an entry learn when it was delivered, through an `onFired` hook. It said nothing about the other way an entry can leave a schedule — the user cancelling it, a tab's timers being cleared, or the tab closing — so `cancel`, `clearAll` and `delete` dropped those hooks silently.

Auto-resume is the only caller, and the consequence is visible on the tab strip: `schedule cancel auto-resume in codex` removes the entry while `HarnessAutoResumer` still believes one is pending, so `reportAutoResumed` never runs and the metadata row keeps reading green `Auto-resuming` for a resume that will never be typed. The tab is also still treated as parked, so it stays unflagged — the honest reading of a tab the user has just told the app to leave alone.

## Approach

1. **`src/schedule/manager.ts`** — the hook slot becomes a pair, `EntryHooks = { fired?, removed? }`, so `add` takes one optional argument that carries both outcomes and a removed hook can never be mistaken for a delivered one. `fireHook` reports `fired`; a new `removedHook` reports `removed`, both dropping the pair as they report so one entry's callbacks never answer for another reusing the id. `cancel` calls `removedHook` for the entry it removed, and the old `forgetHooks` — now `removeHooks` — reports `removed` for every hook it drops, which is what makes `clearAll` and `delete` tell their callers too. `forgetHook` stays a plain delete: it runs when `add` *replaces* an entry of the same id, and the entry is still there under its new instant, so there is nothing to report.
2. **`src/harness/auto-resume-wire.ts`** — both hooks route to `resumer.onSettled()`. The method is renamed from `onDelivered` for that reason: an entry that was withdrawn has not been delivered, and a name claiming otherwise would be the wrong comment above the wire's `reportAutoResumed` call.
3. **`src/remote/serve-processes-detect.ts`** — the far side's no-op callback follows the rename. The remote `resume-ack` is sent from the client's `fired` hook only: the far side re-arms by seeing its own screen change when a blockage clears, so acknowledging a withdrawal would be redundant.

## Tests

- `src/schedule/manager.test.ts` — the cancellation case now asserts `removed` runs exactly once and `fired` never does, for both `cancel` and `clearAll`; a second `cancel` of the same id reports nothing; `closeTab` reports the removal of an entry that was still pending; and an entry replaced through `add` reports nothing, since it was never removed.
- `src/harness/auto-resume-wire.test.ts` — the flag reaches `resumed` from either hook, so a user-cancelled resume stops reading `Auto-resuming`.
- `src/remote/pty-session.test.ts` — the existing acknowledgement case now calls the hook through its `fired` field.

## Spec

`product/specs/harness.md`'s auto-resume section gains a sentence: a resume the user cancels themselves puts the flag back to plain `Auto-resume`, exactly as a blockage clearing on its own does. `product/specs/scheduling.md` needs nothing — its app-added-entry section already says a user can cancel one, which remains true.

## Verification

`./scripts/run.mjs check-diff`, plus: park a codex tab on a usage limit, run `schedule cancel auto-resume in codex` from an agent tab, and confirm the row disappears and the metadata row returns to plain `Auto-resume` without the harness being touched.