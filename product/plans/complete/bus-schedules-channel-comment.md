# Schedules channel comment states both tick rates
**Complexity: 1/10**: a comment-only rewording of the comment above `ScheduleEvent` in `src/bus.ts`. No type, listener, or emission changes.

## Goal

The comment above `ScheduleEvent` in `src/bus.ts` still calls the whole `schedules` channel a named, low-frequency signal that a tab plugin may subscribe to. That was true before the `tick` variant was added. It is no longer true of the channel as a whole, because `tick` is raised on every scheduler tick, about once a second. The comment should name both variants and their rates, so a maintainer who registers a listener on the channel without a type filter sees that `tick` is fast before writing any per-second work.

## Design decisions

The claims in the reviewer's entry were checked against the code before this plan was written. `src/schedule/manager.ts` drives `ScheduleManager.tick` from a `setInterval` of 1000 ms in `start()`, and `tick()` emits `{ type: 'tick' }` on every call. The `schedules` topic source in `src/plugins/topics.ts` subscribes with `messageBus.on('schedules', 'changed', fire)`, so a tab plugin never receives `tick`. The only other `tick` subscriber is `src/schedule/system/runscript-refresh.ts`, which is host code. That is why the comment can say `tick` is internal to the host. The file `src/plugins/notifications.ts` that the existing comment points to still exists, so the pointer stays.

The tick variant keeps its one-line comment, `// Raised on every scheduler tick, changed or not.`, unchanged. The new wording goes in the comment above the type, where a reader of the channel starts.

Rejected: splitting the channel into two channels or narrowing the `tick` type. The type and the emission are correct as written, and the entry asks for no change to either. Also rejected: a test that pins the comment text. No test should pin comment wording, and a test would not show that the comment is accurate.

## Proposed changes

- In `src/bus.ts`, reword the comment above `type ScheduleEvent` so it says `changed` is the named, low-frequency signal a tab plugin may subscribe to, with the existing pointer to `src/plugins/notifications.ts` kept, and says `tick` is raised on every scheduler tick, about once a second, and stays internal to the host.

Nothing else changes. The spec and the help and user documentation describe behavior, and behavior is unchanged.

## Tests

None added. The change is to a comment, and no test pins comment text. `check-diff` still runs the lint and typecheck over `src/bus.ts`, which confirms the edit left the code intact.

## Verification

Read the reworded comment against `src/plugins/topics.ts` (the `changed`-only subscription) and `src/schedule/manager.ts` (the 1000 ms interval and the `tick` emission). Run `./scripts/run.mjs check-diff` and confirm it passes.

## Out of scope

Any change to `ScheduleEvent`, to its listeners, or to the `tick` and `changed` emissions. Any change to the pull request description, since the entry asks for no description correction. Any change to the scheduler's tick interval.
