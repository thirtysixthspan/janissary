# Cover the auto-resume branch of the capture wiring in the wiring's own test

**Complexity: 1/10** — one existing test file gains the cases the plan named for it. No production code changes: the wiring already behaves correctly, and this pins it.

## Problem

`src/harness/capture/wire.test.ts` still called `captureWiring` with the pre-auto-resume five-argument signature, so `autoResume` was `undefined` in every case there and `buildAutoResumer` was never even mocked. The file whose entire subject is *which consumers a capture reaches* therefore said nothing about the third one, and nothing would fail if the fan-out order were inverted.

That order is load-bearing: the resumer runs before the busy handler so the handler reads the tab's parked state as of the same capture. Reversed, a tab parked on a usage limit badges itself — the exact silence the feature exists to provide.

## Approach

Four cases in the existing file, in its existing style:

1. the ordinary capture reaches the approver, then the resumer, then the busy handler, asserted through an order-recording `mockImplementation` on each;
2. a settled re-read reaches the busy handler alone, now covering the resumer too;
3. `autoResume` false builds no resumer and returns none, and a capture reaches only the approver and the busy handler;
4. `autoApprove` false still builds and feeds a resumer, so a tab launched without `-y` can still recover from a limit.

`buildAutoApprover` and `buildAutoResumer` are added to the module mocks and **cleared** in `beforeEach`, not only reset: a case asserting a builder was never called must be reading its own case, not the previous one's calls. That is the one trap in writing case 3, and the reason the file previously could not make the assertion at all.

## Tests

This file is the change: `src/harness/capture/wire.test.ts`, four cases covering order, the settled skip, the off branch for each setting, and the mock clearing that makes the off branch assertable.

## Spec

None. No behavior changed; the feature's own description in `product/specs/harness.md` already states that recognition reads the same captures as auto-approve and busy status, which is what these cases pin.

## Verification

`./scripts/run.mjs check-diff`. To see the order assertion earning its keep, swap the resumer and busy calls in `src/harness/capture/wire.ts` and confirm the first case fails.