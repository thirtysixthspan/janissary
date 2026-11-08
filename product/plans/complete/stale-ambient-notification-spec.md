# Update stale ambient notification counts in the notification spec

**Complexity: 2/10** — the notification spec already documents `command-disabled` as an ambient event and states its muted alert default. Two older references were not updated, so this is a small documentation correction with no runtime changes.

## Goal

Keep the desktop-alert defaults paragraph and the `notify <message>` comparison consistent with the five ambient events documented elsewhere in `product/specs/notifications.md`.

## Approach

Update only the two stale references. Add `command-disabled` to the ambient alert-default list and state that it defaults to no banner and no sound. Change the `notify` comparison from four ambient events to five. Leave the event classification and focus behavior unchanged.

## Implementation steps

1. Update the two passages in `product/specs/notifications.md`.
2. Review the notification spec to confirm its ambient-event inventory and alert defaults agree.

## Tests

- Review the updated notification spec against its existing `command-disabled` classification, toggle, focus-suppression, and muted-alert statements.
- Run `$janissary/scripts/run.mjs check-diff`; no runtime behavior or automated tests need to change.

## Out of scope

- Runtime notification behavior, tests, user documentation, and any other notification-spec wording.
