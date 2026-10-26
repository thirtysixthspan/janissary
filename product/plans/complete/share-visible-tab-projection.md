# Share the visible-tab projection

**Complexity: 5/10** — one framework-free shared selector applies the existing active-plus-secondary visibility rule to a handful of client consumers, with focused unit and alert-placement tests.

## Goal

Use one definition of center-pane visibility so native notifications do not alert for output already visible in the split pane, and rendering/focus consumers stay consistent.

## Approach

Add `visibleTabs(state)` under `web/src/shared/tab/`. It returns the visible current and secondary tab records plus their labels, excluding hidden and docked tabs and following the server's unread-eligibility rule. Use it in alert placement, app current-tab selection, mounted-view layers, and the center action area. Keep the shared module independent of features and app-shell code.

## Implementation steps

1. Add the pure shared selector and tests for current, secondary, hidden, docked, and missing tabs.
2. Replace the duplicated client visibility derivations in alert placement and the app/view composition consumers.
3. Add split-pane native-alert coverage and retain existing rendering tests.
4. Update the technical-debt backlog and promote this plan to complete.

## Tests

- Selector unit tests pin the active and secondary visibility rules.
- Alert-placement tests verify a visible secondary-pane tab suppresses native alerts.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing server unread eligibility or adding further pane types.
- Sending a server-computed visibility list to the client.
