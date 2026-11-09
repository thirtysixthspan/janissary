# Cover the self-disabled native row's disabled Agent access toggle

Issue: The Commands tab test named for a self-disabled row uses the non-native `db` row, so it asserts that Enabled stays interactive but never asserts that a self-disabled native row's Agent access checkbox is disabled. The plan's named scenario is only half covered.

Complexity rating: 2/10

## Goal

Pin the `!effectiveEnabled` branch of `isAgentAccessDisabled` for a native row with no disabled parent: its Enabled toggle stays enabled and unchecked while its Agent access toggle is disabled and checked. Existing parent-disabled and agent-denied coverage stays unchanged.

## Approach

Extend the existing self-disabled test in `web/src/plugins/commands/CommandsTab.test.tsx` rather than adding a sibling, so the non-native and native self-disabled cases sit together. Keep the current `db` assertions: `db` is non-native and self-disabled, so it proves the Enabled toggle stays interactive without an Agent access checkbox. Add assertions on the existing `browser eval` fixture row, which is native, has `enabled: false`, `effectiveEnabled: false`, `agentAccess: true`, `effectiveAgentAccess: false`, and a parent (`browser`) that is enabled, so no parent-disabled state applies.

## Implementation steps

1. Extend the self-disabled case in `web/src/plugins/commands/CommandsTab.test.tsx`: keep the `db` Enabled assertions and no-parent-note check, then assert `Enabled: browser eval` is unchecked and enabled, `Agent access: browser eval` is checked and disabled, and the row carries no `Disabled by parent command: browser.` note.
2. Remove the resolved entry from `product/backlog/pull-request.md`, preserving the other entries.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/commands/CommandsTab.test.tsx`: the self-disabled test covers both the non-native `db` row and the native `browser eval` row; the native row's Agent access toggle is disabled and checked with no disabled parent.
- Existing parent-disabled tests (`dims a parent-disabled row...`, `locks both toggles of a saved-disabled child...`) and the agent-denied test (`disables Agent access without dimming when only a parent denies agent access`) continue to pass.

## Specs and docs

- `product/specs/commands-tab.md` already states that a command disabled on its own keeps an interactive Enabled checkbox while its Agent access checkbox stays disabled until it is enabled, so no spec change is needed.
- No help or user-documentation change: user-visible behavior is unchanged.

## Out of scope

- Any production change to `web/src/plugins/commands/commands-keys.ts` or `web/src/plugins/commands/CommandRow.tsx`.
- New `commands-keys` unit tests or fixtures beyond the existing `browser eval` row.
- Any other backlog entry.
