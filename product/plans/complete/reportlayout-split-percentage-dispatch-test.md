# Forward the split percentage through the layout report

**Complexity: 1/10** — one existing RPC dispatch test gains the required field and assertion, plus a short specification clarification. The handler already forwards the complete payload.

## Goal

Ensure the `reportLayout` dispatch test proves that a valid `splitPct` reaches the controller with the sidebar and tab-area measurements.

## Approach

The handler passes `message.params` directly to `controller.reportLayout`, but the existing test sends and expects only three values. Extend that test with a representative split percentage and assert the complete four-field object. Keep ingress validation coverage unchanged.

## Implementation steps

1. Update the existing `reportLayout` case in `src/message/handler.test.ts` to include `splitPct` in its RPC input and controller expectation. Run `check-diff`.
2. Clarify in `product/specs/tabs.md` that the divider's current percentage is reported alongside the other layout sizes, while remaining absent from profiles and resetting on reload. Run `check-diff`.

## Tests

- Update the existing `reportLayout` dispatch test in `src/message/handler.test.ts` to assert the full object including `splitPct`.
- Keep the decoder cases in `src/client-params/core.test.ts` unchanged; they already cover acceptance of a finite split percentage and rejection of missing or non-finite values.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Spec

Update the split-tab behavior in `product/specs/tabs.md` to state that the divider percentage is reported with the other layout sizes and remains absent from profiles and reset on reload.

## Docs

No public documentation change is needed. The user-visible layout commands do not change.

## Out of scope

- Changes to the handler or controller implementation, which already pass the complete validated payload.
- Changes to RPC validation or the neighboring decoder tests.
- Persisting the center split percentage in saved profiles.
