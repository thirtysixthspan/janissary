<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's notification documentation for the new ambient event and its muted alert default.

Existing Issue: The notification spec's alert-defaults paragraph still lists only the four previous ambient events, and its `notify` comparison still describes four ambient events, omitting `command-disabled` and its muted alert default. Severity: 3/10

Existing Risk: 3/10 - Contributors using those passages as the event inventory may miss that the new event is ambient and default-muted when documenting or changing notification behavior.

Proposal Risk: 1/10 - Updating both references to include `command-disabled` and its alert default leaves little room for the spec to misstate the complete ambient-event set.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "update stale ambient notification counts in the notification spec". In `product/specs/notifications.md`, update the desktop-alert paragraph's ambient-event list to include `command-disabled` and state that its alert defaults to no banner and no sound, consistent with the event's default-muted alert configuration. Update the `notify <message>` comparison to refer to five ambient events rather than four. Keep the event classification and focus behavior already described elsewhere in the spec unchanged. The existing notification-spec review should confirm that the event inventory and alert defaults now agree; no runtime behavior change is needed.
