<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the core-response and capture-timeout contracts in the disabled-command tests so the plan's named capture coverage is real.

Existing Issue: The test named "returns the refusal for every capture contract before capture can time out" runs `ask` on the seeded shell tab, where `acpAvailable` makes `ask` unavailable, so it takes the unknown-input branch rather than the core-response branch; its zero capture limit is ignored by the core-response path and by the structured-result path, and the normal-capture `dispatchLine` cases use the default 30-second limit, leaving the plan's "each capture/result contract" and "refusal preservation when output capture times out" unverified. Severity: 3/10

Existing Risk: 3/10 - A future change that moves the policy check after capture would make a disabled command wait for the capture limit or lose its refusal, and the current tests would still pass.

Proposal Risk: 1/10 - The added cases exercise the real contracts and do not change production behavior unless they expose a defect.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "cover every dispatch capture contract in the disabled-command tests". In `src/command/manager.test.ts`, seed a plugin tab as `src/command/resolve-in-tab.test.ts` does (a `view: 'plugin'` tab plus a `managers.plugins.declarations` entry with `capabilities: ['promptAcp']`) so `ask` resolves as an app, disable `ask`, and dispatch `ask hello` with `captureLimitMs: 0`, asserting `{ dispatched: true, output: 'Command is disabled: ask.' }`; add a normal-capture case that dispatches `clear` with `captureLimitMs: 0` and asserts the refusal returns immediately rather than after the capture limit; keep the existing `agent` structured-result refusal and add an assertion that it returns without a `result`. Keep the existing alias, shared-owner, parent/child, help, queue, schedule, and notification tests passing, and do not change production code unless the new tests reveal a defect.
