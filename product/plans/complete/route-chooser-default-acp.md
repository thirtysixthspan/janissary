# Default route-chooser selection to ACP

**Complexity: 2/10** — a single default-index change plus threading the right index through one hook, with existing tests already covering the reset behavior to update.

## Goal

When a command cannot be auto-routed and the route chooser opens, the highlighted (default) option should be **acp (agent prompt)**, not `shell`. Today `useServerState` always resets `routeIndex` to `0` whenever a chooser newly opens or its command changes, and `routeChoices()` always places `shell` first — so the picker highlights `shell` by default. `routeChoices()` (`src/recognizers/route-choices.ts`) always appends `acp` last, and that ordering is preserved 1:1 through `command/manager.ts`'s `routeView()` into the wire-level `RouteChooserView.choices` array. So the fix is to default the highlighted index to the **last** entry in `choices` instead of `0`.

## Approach

Change the reset logic in `web/src/useServerState.ts` to set `routeIndex` to `nextRoute.choices.length - 1` (the acp entry) instead of `0`, whenever a chooser newly opens or its command changes. No change is needed to `routeChoices()`, `RouteChooser.tsx`, or `keyboard-handlers.ts` — arrow-key clamping already respects `choices.length - 1` as the upper bound, so navigation continues to work unchanged.

## Implementation steps

1. **`web/src/useServerState.ts`** (~line 49-52) — replace the `setRouteIndex(0)` call with `setRouteIndex(nextRoute.choices.length - 1)`, guarding for an empty `choices` array (fall back to `0` if `choices.length === 0`, since `-1` would be invalid). Update the comment above the block to describe defaulting to the acp option (last entry) rather than "the first option."

## Tests

Update `web/src/useServerState.test.ts` to reflect the new default:

- `resets routeIndex to 0 when a chooser newly opens` → rename/update to assert `setRouteIndex` is called with the last index of a non-empty `choices` array (e.g. emit `{ cmd: 'nav', choices: ['shell', 'acp (agent prompt)'] }`, expect `toHaveBeenCalledWith(1)`).
- `resets routeIndex to 0 when the chooser command changes` → same update, asserting the new command's last index.
- `does not reset routeIndex when the same chooser command repeats` — unchanged (still asserts `not.toHaveBeenCalled()`).
- `does not reset routeIndex when no chooser is open` — unchanged.
- Add a new test: when `choices` is empty, `setRouteIndex` is called with `0` (not `-1`).

These tests currently construct payloads with an `options` field (not `choices`) cast via `as unknown as RouteChooserView`, which never exercised `choices` content. Fix them to use the real `choices` field so the tests actually exercise the new logic.

## Out of scope

- `routeChoices()` ordering (`src/recognizers/route-choices.ts`) — acp is already always last; no server-side change needed.
- `RouteChooser.tsx` rendering and `keyboard-handlers.ts` arrow-key navigation — both already work correctly off the passed-in `selected` index and array length.
- Any change to which routes are offered or how auto-routing resolves unambiguous cases (`src/route-choice.ts`).
