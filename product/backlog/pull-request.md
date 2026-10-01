<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's notification test that pins the new event as explicit, firing with no configuration.

Existing Issue: The plan's tests section requires `src/notifications/index.test.ts` to show that `harness-idle` is in `EXPLICIT_EVENTS` and that `shouldNotify` returns it true with no config present, but the diff adds only a feed-line link case, so the "works with no setup" property the plan's classification decision rests on is untested. Severity: 2/10

Existing Risk: 2/10 - A later edit that moves `harness-idle` behind a toggle would leave the feature silently inert for default configs with no test going red.

Proposal Risk: 1/10 - A few assertions in an existing suite, whose only hazard is a test pinning the wrong expectation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: add the planned shouldNotify test for harness-idle". In `src/notifications/index.test.ts`, add a `describe` block beside the other explicit-event blocks asserting `EXPLICIT_EVENTS['harness-idle']` is true, that `shouldNotify` (from `src/notifications/index.ts`) returns true for `harness-idle` with an undefined config and with every ambient toggle off, that it fires when the tab is the active one, and that it never targets the notifications tab itself, matching the shape of the existing `question` and `plugin-note` blocks. No production code changes; the existing format and line-composition cases must keep passing.
