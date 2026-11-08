# Cover every dispatch capture contract in the disabled-command tests

**Complexity: 2/10** — one test file, three dispatch contracts, and a small fixture helper; no production code and no new behavior.

## Goal

Make the disabled-command capture test exercise the contracts it claims to cover. Today `ask` is dispatched on the seeded shell tab, where its `available` check fails, so the test takes the unknown-input branch rather than the core-response branch. The zero capture limit is also ignored by the core-response and structured-result paths, and the normal-capture case uses the default 30-second limit. A future change that moved the policy check after capture would therefore wait for the limit or lose the refusal while these tests still passed.

## Approach

- Seed a plugin tab whose declaration carries `promptAcp`, mirroring `src/command/resolve-in-tab.test.ts`, so `ask` resolves as an application command on that tab.
- Keep `ask`, `agent`, and `clear` disabled in one fixture.
- Dispatch `ask hello` with `captureLimitMs: 0` and assert the exact refusal, proving the core-response contract refuses before execution.
- Keep the `agent execute task.md` structured-result refusal and assert the reply carries no `result`.
- Dispatch `clear` with `captureLimitMs: 0` under fake timers and assert it settles without advancing the timer, proving the normal-capture contract refuses before capture begins rather than after its limit.

## Implementation steps

1. `src/command/manager.test.ts`: import `makePluginTab` and add a helper that replaces the seeded root tab with a plugin tab and supplies `managers.plugins.declarations` with a `promptAcp` capability.
2. Extend the existing "returns the refusal for every capture contract before capture can time out" test with the plugin-tab `ask` case, the no-`result` assertion on `agent`, and the fake-timer `clear` case.
3. Run `$janissary/scripts/run.mjs check-diff` and leave production code unchanged unless the new cases expose a defect.

## Tests

- `src/command/manager.test.ts`: `ask hello` with `captureLimitMs: 0` on a `promptAcp` plugin tab returns `{ dispatched: true, output: 'Command is disabled: ask.' }`.
- Same test: `agent execute task.md` with `captureLimitMs: 0` returns the refusal and no `result`.
- Same test: `clear` with `captureLimitMs: 0` settles before any capture timer advances and returns `{ dispatched: true, output: 'Command is disabled: clear.' }`.
- Keep the existing alias, shared-owner, parent/child, help, queue, schedule, and notification tests passing.

## Out of scope

- Changing dispatch policy or any other production code.
- Changing the functional spec; the refusal-before-effect behavior it describes is unchanged.
- Covering capture contracts outside the disabled-command policy test.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the test change.
