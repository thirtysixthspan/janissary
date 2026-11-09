# Native commands: correct the client integration plan's hand-edit verification

**Complexity: 2/10** — one plan paragraph and one test case; no production behavior changes.

Issue: Verification step 3 in `product/plans/complete/native-commands-10-client-integration.md` says a hand-edited `theme` disable is refused by the server without opening Commands. `NativeCommandSettingsManager` reads `commands.json` only in its constructor, in `refresh()` (the Commands tab opener), and before `edit()`, so a hand edit is invisible to both the client and the server until one of those runs. The step as written expects a refusal the server cannot produce and would make a reviewer record a failure that is actually the documented read point.

## Goal

Make the manual verification step describe the real read points and prove server authority with a stale client against a refreshed server, not with a hand edit alone. Pin the manager's hand-edit read point in a test so a future file watcher or refresh-on-dispatch would be a deliberate change.

## Approach

- Rewrite Verification step 3 to hand-edit the effective `commands.json`, then confirm that without a refresh or edit both the client and the server keep the old snapshot: the stale client may still open the theme picker and the server still runs `theme <name>`.
- State the manager's three read points explicitly: constructor, `refresh()` from the Commands tab opener, and `edit()`.
- Reopen Commands to refresh, then confirm the client list and server dispatch both follow the new snapshot.
- Describe the server-authority proof as a stale client against a refreshed server, for example a second client that missed the state broadcast after another client's refresh or edit: its picker still opens, but dispatch reaches the refreshed server and is refused.
- Add a `src/native-commands/state.test.ts` case that hand-edits the settings file, asserts `manager.current()` and the projection ignore it, then calls `refresh()` and asserts they reflect it.

## Implementation steps

1. `product/plans/complete/native-commands-10-client-integration.md` — replace Verification step 3.
2. `src/native-commands/state.test.ts` — expose the fixture's settings file path and add the hand-edit-until-refresh case.

## Tests

- `src/native-commands/state.test.ts`: a manager constructed with an empty settings file ignores a hand-written `theme` disable in `current()` and `projectDisabledApplicationCommands`; after `refresh()` the snapshot and projection include the disabled row.

## Out of scope

- Any file watcher or refresh-on-dispatch; hand edits apply only at the manager's existing read points.
- Production code changes; the manager and projection already behave correctly.
- Spec changes; `product/specs/application-commands.md` already states that settings are re-read at initialization, when the Commands tab opens, and before every edit.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Read the rewritten step against `src/native-commands/manager.ts:18`, `:37`, and `:42` and confirm it no longer claims a hand edit alone is refused.
