# Capture the caller's offline flag at subagent launch receipt

**Complexity: 1/10** — 1 added line, 1 production file, 2 requirements, 1 scenario, 0 new units (p=3.06)

## Goal

Make a subagent's offline confinement reflect the caller tab's offline flag as it was when the launch receipt was published, so a flag change in the window between receipt and the scheduled continuation cannot alter the run.

## Approach and implementation steps

1. In `launchSubagent` (`src/subagent/launch.ts`), read `tab.offline` into a local constant alongside the other launch-input snapshots taken before the receipt is returned. Pass that constant to `continueLaunch` as its `offline` value instead of reading `tab.offline` inside the `queueMicrotask` callback. Leave the invocation, settings, entries, channel and host snapshots exactly as they are.
2. Run `$janissary/scripts/run.mjs check-diff` and fix any failures.
3. Extend the existing mutation-snapshot case in `src/subagent/launch.test.ts` so it mutates the caller tab's offline flag after launch and asserts the executor receives the value captured at receipt. Keep the existing invocation, settings, entries, channel and host snapshot assertions unchanged. Run `$janissary/scripts/run.mjs check-diff` again.
4. Confirm the behavior against `product/specs/subagent.md` — the spec already states offline state is snapshotted at receipt, so no spec edit is expected — then promote the plan, remove the resolved backlog entry and publish.

## Tests

In the `snapshots settings, invocation, offline and role against later mutation` case, give the caller tab a known offline value before launch, capture that value as the receipt-time snapshot, change the tab's flag after launch, and assert the options passed to `executeSubagentRun` still carry the receipt-time value. Retain every existing assertion in that case and in the surrounding suite.

## Out of scope

Changing how the offline flag is applied to the sandbox, altering any other launch snapshot (invocation, settings, entries, channel, host), changing the spec wording, touching the PR description, or working any other backlog entry.
