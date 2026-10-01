# Pin harness-idle as an explicit notification event that fires with no configuration

**Complexity: 1/10** — one `describe` block in an existing test file; no production change.

This pull request's plan asks `src/notifications/index.test.ts` to show that `harness-idle` is in `EXPLICIT_EVENTS` and that `shouldNotify` returns it true with no config present; the diff added only a feed-line link case. Reading the file shows the table-driven block "shouldNotify covers every notification event" already runs every member of `EXPLICIT_EVENTS` through `shouldNotify` with an undefined config, with every toggle off, on the active tab, and on the notifications tab — so `harness-idle` is exercised as long as it stays in that table. What nothing pins is the classification itself: moving `harness-idle` to `AMBIENT_EVENTS` behind a new toggle would type-check and turn the table-driven cases into ambient ones that still pass, leaving the feature inert for every default config with no test going red.

## Goal

A named block that fails if `harness-idle` stops being explicit or stops firing without configuration.

## Implementation steps

1. `src/notifications/index.test.ts`: add `describe('shouldNotify — harness-idle event', …)` beside the other explicit-event blocks, asserting that `EXPLICIT_EVENTS['harness-idle']` is true and that `harness-idle` is not a key of `AMBIENT_EVENTS`; that `shouldNotify` returns true for it with an undefined config and with every toggle off; that it fires when its tab is the active one; and that it never targets the notifications tab itself.

## Tests

The block above. The existing format, line-composition, and table-driven cases must keep passing.

## Out of scope

- Any production change, and any toast-link test (a toast carries no link; see `product/plans/complete/harness-idle-toast-click-claim.md`).
