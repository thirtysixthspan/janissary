# Move the harness spec's idle-escalation section after the busy/ready paragraphs and correct its cancellation list

**Complexity: 2/10** — a documentation correction in one spec plus one source comment; no behavior change.

`product/specs/harness.md` inserts the new `### The idle escalation` heading in the middle of § Busy/ready status, so two pre-existing busy/ready paragraphs — a recognized permission prompt badging the tab immediately, and harnesses with no recognition signal keeping the coarse behavior — now sit under the escalation heading, and the escalation's reference to "an unanswered permission gate" comes before the paragraph that defines it. The section also says clearing the badge cancels the escalation when the tab "is reordered or undocked and something else becomes active", and the header comment in `src/harness/idle-notification.ts` repeats it as "reordered away", but neither operation clears a hidden harness tab's badge.

## Goal

§ Busy/ready status is contiguous, § The idle escalation follows it, and the cancellation list names only the routes that actually take the badge off or cancel the escalation.

## Implementation steps

1. `product/specs/harness.md`: move the two paragraphs beginning "When claude, opencode, or codex shows a recognized permission prompt" and "A harness without its own recognition signals" back above `### The idle escalation`.
2. In the escalation's cancellation sentence, replace "or it is reordered or undocked and something else becomes active" with the real routes: you dwell on the tab, the harness goes back to work, the tab becomes the visible selection in the other pane, or the tab is closed.
3. `src/harness/idle-notification.ts`: correct the header comment's list the same way, dropping "or reordered away".
4. Confirm the cross-references to "harness.md § The idle escalation" in `product/specs/notifications.md` and `product/specs/tabs.md` still resolve (the heading text is unchanged).

## Tests

None — no behavior changes. `check-diff` confirms the comment edit lints and typechecks.

## Out of scope

- Any behavior change to which operations clear a badge.
- User documentation: `documentation/user-documentation/tab-types/notifications.md` makes no reorder claim.
