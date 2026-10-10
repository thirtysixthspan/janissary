# Do not raise needs-you for a gate the application is answering

**Complexity: 5/10** — one recorded fact redefined rather than one more added, one derivation that reuses a decision already computed, and four capture-order tests.

`busyStatusHandler` in `src/harness/busy-status.ts` records `detectPermissionGate(capture.text, name)` on the tab's runtime, and `src/plugins/activity.ts` reads that raw screen fact as `needsInput`. Meanwhile `BusyTracker.observe` is already handed the answer: `stuck`, which is the caller's `!approver || approver.isStuck`, plus the parked-resumer flag. A permission gate that auto-approve is clearing, and a tab parked on a scheduled resume, both produce a transition with `unread: false` — nothing is waiting on the user — while `gateOpen` goes true anyway. `needsInput` then puts that tab in the launcher's highest tier, under **needs you**, telling the user to answer a prompt the application is answering itself.

The two facts are recorded one line apart and disagree, which is the whole bug. `BusyTracker` computes the attention decision from `stuck`; the tab record writes the screen's shape.

## Goal

A tab is recorded as held at a permission gate only when the user actually has to answer it, and the launcher's needs-you tier follows.

## Approach

1. **`src/harness/busy-status.ts`** derives what it records from the same inputs `observe` is given: the gate is on screen, the approver has not stood down on it, and no resumer is parked on the tab. One derivation, one line, computed beside the call that already has both values.
2. The field is **redefined rather than added**. `gateOpen` becomes `gateNeedsUser` — a gate that is open and needs nobody is not this fact, and a reader of the old name would be entitled to read it that way. It is six source locations, all of them the ones this change touches anyway.
3. **`src/plugins/activity.ts`** reads the renamed field for `needsInput`, and `recordGateOpen` becomes `recordGateNeedsUser` so the writer's name says what it writes. Pending questions remain an independent `needsInput` source: a question is a user answer whether or not a screen gate is present.
4. The capture ordering in `src/harness/capture/wire.ts` — approval before busy classification — is untouched, because that ordering is what makes the derivation correct: the approver has already seen this capture by the time the handler records anything.

### Rejected alternatives

- A second field beside `gateOpen` for the attention fact. Two records of one question is how they drift apart in the first place, and every reader would have to know which one to ask.
- Leaving the name and changing only the comment. The name is what the next reader trusts; `gateOpen: false` beside a visible gate reads as a detection failure, not as a decision.
- Suppressing `needsInput` at the reader instead. The launcher is not the only consumer that should not be told a gate needs the user, and the fact recorded on the tab is the one that is wrong.

## Implementation steps

1. Redefine the runtime field and its comment.
2. Derive and record the attention fact in `busyStatusHandler`, and rename the writer.
3. Read it in `needsInput`.
4. Extend both test files.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/harness/busy-status.test.ts`, in the state-push suite: an auto-approved gate records no attention fact and emits nothing new for it; the identical gate a second time, which is what makes the approver stand down, records one and badges the tab; a gate with no approver records one; and a gate that clears records none and emits. Each case checks the row status and the dirty emission.
- `src/plugins/activity.test.ts`: the reader reports `needsInput` from the renamed field, and still reports it from a pending question with no gate at all.

## Spec updates

- `product/specs/launcher.md`: the needs-you tier follows a gate the user has to answer, and a gate the application is answering itself — auto-approved, or parked on a scheduled resume — does not put a tab there.
- `product/plans/complete/sidebar-launcher-tab.md`, whose two mentions of the old field describe the raw-screen-fact behaviour this replaces.

## Out of scope

- Making a remote harness's gate visible as needs-input. It arrives as a bare busy/unread pair, which is the documented limitation of the tier.
- What auto-approve does with a gate it can clear, which is its own module's business.
