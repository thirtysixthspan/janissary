# One guarded delivery skeleton for the background channels

## Complexity

4/10 — one new module holding what two delivery modules duplicate, both rewired to it, and a test for the extracted skeleton. No behavior change; the risk is only in moving the guard, invoke, and disable sequence without altering its order.

## Goal

`src/plugins/notifications.ts` and `src/plugins/host-state.ts` carry the same skeleton twice: an identical `BACKGROUND_ORIGIN` constant, near-identical five-field ports differing only in the extra view readers, and the same five-line `deliver` that invokes with the background origin under the channel's budget and disables only on failure. The rule that matters — a background delivery never answers a rejection and only a failure disables — is maintained in two places by comment. A third background channel gets written from scratch again, and any change to the common policy has to be made twice with nothing failing when it is made once, so the two channels can end up answering the same failure differently.

## Approach

Lift the skeleton into one module and have both channels import it: the background origin, the port fields the skeleton itself needs, and `deliverBackground`, which takes the record, the activation member the channel delivers through, and the event, and returns the guarded call. Each channel keeps everything that actually differs — notifications' topic selection and `ownedTabs`, host-state's fingerprint comparison and its `connectionsFor`/`scheduleView` readers — and its port type becomes the shared fields plus its own. The skeleton cannot live in `host-channels.ts` as the item's text says: that module imports both channels to compose them, so importing it back would make a cycle the `import-x/no-cycle` rule exists to prevent. A sibling module both channels import keeps the composition one-way, which is the arrangement `host-channels.ts` was built for. The extracted module gains the test neither channel asserts today — that a rejection leaves the plugin running — and both channels' end-to-end suites keep passing unchanged.

## Implementation

1. Add `src/plugins/background-delivery.ts` exporting `BACKGROUND_ORIGIN`, the `BackgroundDeliveryPort` fields the skeleton needs (`records`, `timeoutMs`, `invoke`, `disable`), and `deliverBackground(port, record, handler, event)`: no handler or no activation is nothing to deliver; otherwise invoke under the background origin and the port's budget, and disable the plugin only when the outcome is `failed`.
2. In `src/plugins/notifications.ts`, import the shared origin, port fields, and delivery; express `TabPluginNotificationPort` as the shared fields plus `managers`; delete the local `BACKGROUND_ORIGIN`, `deliver`, and the duplicated port fields; call `deliverBackground` from `dispatch`.
3. In `src/plugins/host-state.ts`, do the same, with the port carrying its two view readers beside the shared fields, and `dispatch` calling `deliverBackground` with `record.activation?.hostState`.
4. In `src/plugins/host-channels.ts`, derive `GuardedCall` from the shared port so the invoke signature has one definition.
5. Add `src/plugins/background-delivery.test.ts`: a rejection leaves the plugin running and disables nothing; a failure disables the plugin with the background origin; an absent handler never invokes; the invoke receives the background origin and the port's budget and the handler receives the event and the capabilities.
6. Run `./scripts/run.mjs check-diff` after the module, after each channel, and after the test.

## Tests

- `src/plugins/background-delivery.test.ts` as listed above, with fakes in the style `define-intents.test.ts` uses.
- `src/plugins/notifications.test.ts` and `src/plugins/host-state.test.ts` pass unchanged — they run both channels end to end through `TabPluginHost` and already pin the delivered payload, the disable-on-failure path, the disable-on-timeout path, and that a handler calling `note` writes no transcript line (the background origin at work).

## Out of scope

- The channels' selection and change-detection logic (`ownedTabs`, the topic fan-out, the fingerprint comparison, the runtime marking).
- The host's own guard and timeout implementation in `invoke.ts`, which both channels already share.
- `host-channels.ts`'s composition role and its `timeouts` wiring.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `BACKGROUND_ORIGIN` finds exactly one definition, in `background-delivery.ts`.
- Both channels' end-to-end suites pass with no edits, so the guard, invoke, and disable sequence survived the move.

## Documentation and specification impact

None. This is a pure extraction with no behavior change; no spec, `help.md`, or user documentation describes the delivery modules.
