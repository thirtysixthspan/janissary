# Native commands: host topic

**Complexity: 4/10** — topic action validation, current snapshots, and awaited edit results cross the plugin contract.

## Goal

Expose one narrow, validated host topic for command inventory, effective availability, and settings edits to activated plugins.

## Decisions and dependencies

- Depends on inventory and settings (work units 1–2); place after work units 3–6 in the ordered feature sequence. The host service remains the only authority.
- Follow the Models topic and awaited Delete result, preserve additive and capability-narrow plugin API evolution, and update guards and payload schema versions whenever shapes change. Only open, activated plugin tabs receive notifications; initial reads return the current snapshot without waiting for a change.

## Existing code to reuse

`src/plugins/api-topics.ts`, `src/plugins/api-topics-models.ts`, `src/plugins/topics.ts`, `src/plugins/models/activate.ts`, host plugin capability and notification routing, `src/protocol.ts`, and the service from work unit 2.

## Proposed changes

1. Add the command topic's import-free view contract and narrow validated edit action; include source path/problem, canonical rows, saved toggles and effective parent/global/agent restrictions needed by both tabs. Expose a current snapshot and subscribe to service publications.
2. Await edit results so the caller can report exact refusals. Validate topic actions at ingress, preserve existing topic capability boundaries, and bump relevant schema versions/guards for changed payloads. Opening Commands will explicitly refresh the service in its own work unit.
3. Document the additive topic and affected plugin contract in applicable tab-plugin specs.

## Tests

Cover topic reads of current state before notifications, change publication, only activated open tab delivery, malformed and unauthorized actions, successful awaited edits, failed writes and refusals, parent restrictions, and compatibility with unrelated topics.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused host topic, API validation, and plugin lifecycle tests.

## Out of scope

The Commands and Roles surfaces and command-line forms are implemented by subsequent work units.
