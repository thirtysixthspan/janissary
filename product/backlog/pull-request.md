<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the message bus comment that still calls the schedules channel a low-frequency signal, now that the same channel carries a per-second tick (technical debt).

Existing Issue: The comment above the schedules event type still describes the whole channel as a low-frequency signal, but the tick variant this commit adds is raised on every scheduler tick, so the channel is no longer low-frequency as a whole. Severity: 2/10

Existing Risk: 3/10 - A maintainer who trusts that comment could register a listener for both schedules variants without a type filter and do per-second work, believing the channel is quiet.

Proposal Risk: 1/10 - A reader sees both frequencies before subscribing, and the plugin-facing promise still holds because the schedules topic source subscribes to the changed variant only.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the tick frequency in the schedules channel comment". In `src/bus.ts`, the comment above the schedules event type calls the channel a named, low-frequency signal that a tab plugin may subscribe to. Reword it so the changed variant is the low-frequency signal plugins subscribe to, and the tick variant is raised on every scheduler tick, about once a second, and is internal to the host. Keep the existing pointer to the plugin notification path and the one-line comment already on the tick variant. Change no type, listener, or emission: the schedules topic source in `src/plugins/topics.ts` subscribes to changed only, and the tick emission in `src/schedule/manager.ts` is correct as written. No test pins comment text. Verify by reading the reworded comment against those two places.
