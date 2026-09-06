# Release browser test resources on every path

**Complexity: 3/10** - the change is limited to test ownership and teardown, but the real port-boundary case must remain safe when only part of its setup succeeds.

## Issue

The browser scratch suite creates a fresh temporary root before each case but removes only the final root after the suite. The real sandbox port-boundary suite closes all servers unconditionally, so an occupied required port causes setup to return early and teardown to close a server that never listened. Browser sandbox unit cases also leave their per-case configuration directories behind.

## Approach

Make each suite explicitly own every temporary resource it creates. Scratch and browser-spawn tests will remove their current case's roots in `afterEach`. The real port test will retain its configuration root, close only listening servers, and use Vitest's test context to record a skip when the fixed host ports are unavailable. Teardown remains responsible for every resource created before the skip.

## Implementation

1. Replace the scratch allocator suite's one-time cleanup with per-case cleanup that removes the root created by that case.
2. Track browser-spawn configuration roots and remove them after every case, including cases that temporarily switch to unconfined configuration.
3. Track the real sandbox port test's configuration root, make server closure conditional on `listening`, and skip through the Vitest context when any required port cannot bind.
4. Remove only this resolved entry from `product/backlog/pull-request.md` after verification succeeds.

## Tests

Run `src/browser/e2e-scratch.test.ts` and `src/sandbox/browser-spawn.test.ts` in isolation more than once. Run the real `src/sandbox/browser-port.sandbox.test.ts` suite on this unsandboxed host, including its genuine Seatbelt assertions. Compare matching temporary-directory listings before and after the runs and confirm no new `e2e-scratch-*`, `sandbox-cfg-*`, or `sandbox-browser-port-*` roots remain. Run `./scripts/run.mjs check-diff`.

## Documentation

No product specification or user documentation changes. This corrects test lifecycle behavior only.

## Out of scope

- Changing production scratch allocation or sandbox policy.
- Cleaning temporary resources owned by unrelated legacy suites.
- Changing how unavailable host ports are selected.

## Verification result

The scratch and browser-spawn suites passed twice in isolation with 25 cases each run. The real Seatbelt port-boundary suite passed twice with its port available, and the complete sandbox project passed all 16 cases. Reserving the first fixed browser port before a further isolated run produced one proper Vitest skip without a teardown error. With `TMPDIR` directed to the repository's ignored `temp/` directory, the isolated success and skip runs left no matching `e2e-scratch-*`, `sandbox-cfg-*`, or `sandbox-browser-port-*` roots. `./scripts/run.mjs check-diff` passes.
