# suppress empty system schedule notices

**Complexity: 2/10** — a narrow notification condition with focused manager coverage and one spec clarification.

## Goal

Do not announce a system-schedule firing when a valid runscript contains no executable lines. Preserve successful one-shot removal, recurring advancement, and the existing no-row queue behavior.

## Approach

Keep enqueueing every scheduled batch through the existing path, but call the firing-notice helper only when the parsed line list is nonempty. Test the observable manager behavior for empty and nonempty runscripts.

## Implementation steps

1. Guard the firing notice in `appendSystemBatch` when there are no lines.
2. Add manager tests proving empty runscripts produce no queue rows or firing notice while schedule state advances, and nonempty scripts enqueue their lines and post the firing notice.
3. Clarify the system-schedule firing behavior in `product/specs/scheduling.md`.

## Tests

- Empty one-shot and recurring runscripts advance successfully without queue rows or a firing notice.
- Nonempty runscripts enqueue their lines and post a firing notice.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Missing, unreadable, or unsafe script behavior.
- User notification preferences or other system-schedule notices.
