<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's complete ambient alert-default inventory in the desktop-alert passage.

Existing Issue: The desktop-alert passage still labels the inventory as the four prior ambient events and describes `command-disabled` separately, so the requested five-event list is not delivered there. Severity: 2/10

Existing Risk: 2/10 - Readers treating the named inventory as authoritative may continue overlooking `command-disabled` when comparing ambient alert defaults.

Proposal Risk: 1/10 - A single five-event inventory that states all five default to no banner and no sound will make the alert-default statement complete and unambiguous.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "include command-disabled in the desktop-alert ambient inventory". In `product/specs/notifications.md`, update the desktop-alert defaults passage so its ambient-event list names `state-change`, `schedule-fire`, `agent-start`, `rate-limited`, and `command-disabled`, and explicitly state that all five default to no banner and no sound. Keep the separate `command-disabled` classification, muted alert configuration, and focus behavior unchanged. Review the surrounding desktop-alert section to confirm there is one consistent ambient default inventory; do not change runtime behavior.
