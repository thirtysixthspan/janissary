# Return focus to Add model after an entry is added

**Complexity: 3/10** — ~15 added production lines in 2 files, 4 requirements, 5 scenarios (p=4.446)

## Goal

Make the roles Add model picker reliably close and return focus to its own **Add model** button when a model entry is added with Return, as promised by the PR description's step 5 and by `product/specs/roles.md`.

## Investigation findings

The recorded finding attributes the symptom to the roles republish re-registering the plugin tab and reopening the picker. That mechanism does not hold in this code:

- `MountedViewLayers.tsx` keys `PluginTabLayer` by the stable tab label, and `src/plugins/roles/activate.ts` republishes with `capabilities.updateTab(INSTANCE_KEY, () => ({ payload }))`, so a payload update re-renders the same tab in place. `RolesTab.tsx` keys each `RoleCard` by the role name, which an add-entry does not change. The card and its `useRolePickerFocus` state survive the republish.
- Reproducing the exact finding sequence (claude harness, type `opus`, Tab, click the candidate, Return) and then republishing a payload with the new entry shows the picker already closes and `.roles-add-model` already has focus, with or without React StrictMode.

The intended behavior is close-and-return-focus, and the code and text agree on that outcome. The real weakness is *how* focus is returned: `useRolePickerFocus` restores focus from a passive effect gated on `wasOpen.current`, which is written by the effect of the preceding render. When the open and close land in the same React batch — as a fast Return or a close that races with the republish can produce — that flag is still false, so the close leaves focus on the harness select and never reaches the opener. That is the observed focus target, and it is the behavior this fix removes.

## Approach

Make the close path explicit: a close requested through `closePicker()` records that focus must return to the opener, independent of when the open effect ran. `addPicked` closes before raising the intent so the close is committed before the asynchronous write and republish. The existing heading-fallback path for an opener that is gone (all commands granted, role removed) is preserved.

## Implementation steps

1. In `web/src/plugins/roles/useRolePickerFocus.ts`, add a `returnFocusRef` that `closePicker()` sets. Extend the close branch of the focus effect to act on `wasOpen.current || returnFocusRef.current`, clear the flag there, and keep the existing opener-or-heading decision.
2. In `web/src/plugins/roles/RoleCard.tsx`, call `modelsPicker.closePicker()` before `raise('add-entry', …)` in `addPicked`, so the picker closes before the write and any republish it triggers.
3. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- Add `web/src/plugins/roles/useRolePickerFocus.test.tsx`: a focused harness that opens and closes the picker in one React batch (so the open effect never runs) asserts focus still lands on the opener; also assert the heading fallback when the opener is unavailable.
- Add a case to `web/src/plugins/roles/RolesTab.test.tsx`: add a model with Return on the edited card, publish a payload containing the new entry, and assert the picker is closed and that card's `.roles-add-model` button has focus.
- Keep the existing focus cases in `RolesTab.test.tsx` (Add, Cancel, Escape, first-Escape-closes-dropdown, commands heading fallback) passing.

## Specs and docs

`product/specs/roles.md` already states that both pickers return focus to their own add button on Add, Cancel, or Escape. The behavior is unchanged, so no spec edit. No help or user-documentation page describes this focus detail, so no doc edit.

## Out of scope

- No change to the model search input, its dropdown, or its key handling.
- No change to the New harness dialog.
- No change to the server roles write or republish path.
- No change to the PR description.

## Verification

- `$janissary/scripts/run.mjs check-diff` clean after each change.
- New and existing RolesTab and useRolePickerFocus tests pass.
