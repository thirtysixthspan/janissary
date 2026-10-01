# Clear a pending unread dwell when the newly selected tab carries no badge

**Complexity: 1/10** — one statement moves inside one function, one test case is added beside an
existing suite, and no behavior outside the unread dwell changes. The risk is entirely in whether
the new case would fail against the current code, which it does.

`beginDwell` decides whether a tab is worth starting a dwell for by looking at its badge, and
returns early when there is nothing to clear. That early return currently sits *above* the call
that discards whatever dwell was already pending, so the "nothing to do" case quietly becomes "do
nothing at all" — including not replacing the candidate that was already counting down.

That inverts the rule the feature is built on. A dwell is meant to be continuous per tab: switching
tabs restarts the clock, so a glance at one tab and a move on to another is never mistaken for
having read either. Instead, a dwell armed for a badged tab survives a switch to any tab that
carries no badge, and three seconds later clears the badge of the tab the user just left — and
because that badge is what arms the thirty-second harness escalation, the same switch also cancels a
notification the user never received. The spec this feature shipped alongside states the intended
behavior directly, so the code and its own documentation disagree.

## Approach

In `src/tab/dwell.ts`, `beginDwell` does two things that must both happen on every call: discard
the pending dwell, and arm a new one if the selected tab has a badge worth clearing. The guard
against arming a pointless timer is right; its position is wrong. Move the existing `clearPending()`
call above the guard so the replacement is unconditional, and leave the guard exactly as it is so
the common case — moving around a strip of tabs nobody is waiting on — still arms no timer.

Nothing else changes. The resolver contract, the label, the interval, the `unref`, and the
fire-time `clearUnreadTab` call are all already correct, and `disposeDwell` already routes through
the same `clearPending` helper this fix moves.

## Implementation steps

1. **`src/tab/dwell.ts`** — in `beginDwell`, move `clearPending()` to run before the
   `if (!tab?.hasUnread) return;` guard rather than after it. Update the function's comment to say
   that every call replaces the pending dwell and that the guard only decides whether a new one is
   armed, so the ordering does not read as an accident. The existing comment already explains the
   replace semantics and the reason for the label; keep that and add the ordering point rather than
   rewriting the block.

2. **`src/tab/dwell.test.ts`** — add a case covering the sequence the suite currently misses: begin a
   dwell on a badged tab, then begin one on a second tab that carries no badge, let the interval
   elapse, and assert the first tab still carries its badge. This fails against the current code and
   passes after the fix. Leave the existing "replaces a pending dwell rather than queueing a second
   one" case untouched — both of its tabs are badged, so it reaches `clearPending()` on each call
   and passes either way, which makes it the regression guard for the replace path rather than for
   this one.

## Tests

One new case in `src/tab/dwell.test.ts`, alongside the ten already there, using the same
`vi.useFakeTimers()` scoping the file already uses. No other suite changes: the four that exercise
the deferring sites — `src/controller.test.ts`, `src/tab/manager.test.ts`,
`src/tab/operations.test.ts`, `src/tab/split-selection.test.ts` — reach `beginDwell` only through
`setActiveTab` and friends and must keep passing untouched.

## Out of scope

- The `resolveTabs` fallback in the deferring callers, and the one production caller that omits a
  resolver. That is a separate recorded finding with its own plan.
- Making the guard itself unnecessary by tracking dwell state on the tab. The guard is correct and
  cheap; only its position was wrong.
- Any spec change. `product/specs/tabs.md` already states the intended invariant — "Switching tabs
  restarts the clock rather than leaving the earlier tab's dwell to finish" — so the fix brings the
  code into line with the spec rather than the other way round.
- `help.md` and `documentation/user-documentation/`. The documented behavior does not change; the
  implementation stops contradicting it.

## Verification

`$janissary/scripts/run.mjs check-diff`, which must show the new case passing along with the rest of
the suite.

Then confirm the fix is real rather than assumed: revert the one-line move, run
`npx vitest run --project server src/tab/dwell.test.ts`, and confirm the new case fails. Restore the
move and confirm it passes. Then by hand: badge a hidden tab by delivering a `msg` to it, click it,
click an unbadged tab, wait three seconds, and confirm the first tab still carries its flag.
