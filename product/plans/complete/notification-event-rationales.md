# Keep notification event rationale with its classification

**Complexity: 1/10** — one comments-only edit in `src/notifications/index.ts`. The event unions, keyed classification tables, and behavior already exist; the change removes stale prose and moves each event's rationale beside its classification.

## Goal

Make the reason for each notification event's classification easy to find at the event's entry, without maintaining a second event catalog or counts that can drift from the union.

## Approach

Delete the event catalog above `NotificationEventType`. Add concise, event-specific rationale comments next to every key in `AMBIENT_EVENTS` and `EXPLICIT_EVENTS`, preserving the distinction between background activity and reports that should remain visible while their source tab is active. Replace count-based wording with count-free explanations and keep the `system-schedule-fire` special-case explanation in `shouldNotify`.

No runtime code or test assertions change. The existing `src/notifications/index.test.ts` classification and delivery coverage must continue to pass.

## Implementation steps

1. In `src/notifications/index.ts`, remove the hand-kept catalog above `NotificationEventType` and the stale ambient-count wording.
2. Put each event's concise rationale beside its entry in `AMBIENT_EVENTS` or `EXPLICIT_EVENTS`. Keep the union-keyed exhaustive tables and all runtime expressions unchanged; remove the obsolete explicit-event catalog and count claim.
3. Retain the explanation in `shouldNotify` for `system-schedule-fire` and its own default-on config toggle.

## Tests

- Run the existing `src/notifications/index.test.ts` suite and the diff-scoped checks. No new test is needed because this change only relocates and corrects comments; existing tests verify event classification and the special schedule behavior.

## Specs and documentation

No spec or public documentation change is needed. This comments-only change does not alter observable notification behavior, and the existing spec and user documentation describe that behavior rather than implementation comments.

## Out of scope

- Changing notification classification, configuration, delivery, messages, or event-union members.
- Editing tests or documentation to restate unchanged behavior.
- Modifying any other technical-debt entry.
