# Bring the metadata row's detach confirmation to the shared dialog contract

Complexity: 3/10

## Goal

The confirmation `RemoteSessionButton` renders for a detach raised from a remote tab's metadata row
was bare modal markup — nothing focused into it, no keydown listener, so Escape could not cancel,
Enter could not confirm, and a keyboard user had no way out but the mouse — while the plugin lists
render the same question on the shared host-side `ConfirmDialog` with the full y/n/Enter/Escape and
arrow-key contract, pinned by tests on both fronts.

## Approach

The shared dialog already exists: `web/src/shared/ConfirmDialog.tsx`, extracted earlier in this pull
request when the plugin lists' two line-for-line copies were collapsed, published to plugins through
`web/src/plugins/api.ts`. The metadata row's confirmation renders it instead of its own markup, which
makes the two front doors one dialog by construction and removes the bare-markup copy. No new shared
module is needed — the proposal's "extract the shared shape host-side" is already done; the fix is to
consume it.

## Implementation steps

1. `web/src/shared/RemoteSessionButton.tsx` — replace the bare modal markup with `ConfirmDialog`
   (title naming what will go, `Detach` confirm button, cancel and confirm through the dialog).

## Tests

`web/src/shared/AgentTabMeta.test.tsx`, beside the existing remote-session-control confirmation
cases:

- Escape cancels and closes the dialog;
- `y` confirms and `n` cancels without a second raise;
- the arrow keys move the selection and Enter takes it, with a reflexive Enter on the
  cancel-first default doing nothing;
- focus lands inside the dialog when it opens.

The confirmation cases in `web/src/plugins/sessions/SessionList.test.tsx` pin the same shared
contract and keep passing unchanged.

## Out of scope

- `ConfirmDialog` itself — the contract it implements is already pinned by the plugin lists' tests.
- Any behavior change to what the detach does once confirmed.
