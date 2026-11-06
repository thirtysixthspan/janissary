# Models tab Delete refusal

**Complexity: 2/10** — show asynchronous Delete refusals in the Models tab and cover the stale-confirmation case.

## Goal

Make a refused Models Delete visible to the user after the confirmation dialog closes.

## Decisions

- The host already rejects a stale Delete as an ordinary intent error and keeps the plugin active. The Models view must catch that promise instead of discarding it.
- Show the refusal as a dismissible alert within the Models tab. Clear an earlier refusal when the user starts another Delete.
- Keep the confirmation dialog behavior and catalog state unchanged; the host remains authoritative about whether the row can be deleted.

## Changes

1. Add request-error state to the Models tab. Catch Delete intent errors and render their text in a `role="alert"` with a dismiss control.
2. Add a component test where Delete rejects with the manager's stale-model reason; assert the message is visible and dismissible. Preserve the existing successful confirmation assertions.
3. Update `product/specs/models-tab.md` and the Models user page to describe the visible refusal.
4. Run `./scripts/run.mjs check-diff` and the Models tab's focused web test through the project's approved workflow.

## Out of scope

- Changing host rejection semantics, delete authorization, catalog persistence, or notifications.
- Changing other plugin tabs' request-error handling.
