# Consolidate the plugin lists' selection clamp into one shared module

## Complexity

2/10 — one new pure module and its test, one additive re-export on the client plugin API, and three plugin keys modules reduced to delegating to it. No behavior changes.

## Goal

The conversations, sessions, and schedules plugin lists each carry an identical copy of the same non-wrapping selection clamp: `nextConversationSelection` in `web/src/plugins/conversations/conversation-list-keys.ts`, `nextSessionSelection` in `web/src/plugins/sessions/sessions-keys.ts`, and `nextSelection` in `web/src/plugins/schedules/schedules-keys.ts`. ArrowDown and ArrowUp step by one and stop at the ends, Home and End jump to the ends, an empty list yields `null`, and any other key leaves the selection alone. The equivalence is maintained only by comments, so a gesture change (PageUp, wrap-at-ends) has to be re-applied three times by hand and one list can drift silently. By §2 of the React organization guideline, three real consumers is well past the point where the rule belongs in one shared place.

## Approach

The backlog entry proposed `web/src/shared/list-selection.ts` imported directly by the three plugins. The direct import is not allowed: `eslint.plugin-boundaries.mjs` restricts a concrete client plugin to `../api`, `../shared.css`, and its own `@shared/plugins/<id>/shared` contract, so `../../shared/list-selection` from a plugin file is a lint error. The codebase already has a pattern for exactly this case: `ConfirmDialog`, `InlineEditInput`, and `ConnectionPlug` live in `web/src/shared/` and reach plugins through a re-export from `web/src/plugins/api.ts`, the published client plugin surface (`ConfirmDialog` shipped as two identical per-plugin copies before being published that way).

So the pure function lives at `web/src/shared/list-selection.ts` as `nextListSelection(length, selected, key)`, and `web/src/plugins/api.ts` re-exports it with a short note, additive, so `TAB_PLUGIN_API_VERSION` does not move. Each plugin keys module then re-exports `nextListSelection` from `../api` under its existing exported name, so the call sites in `ConversationList.tsx`, `SessionList.tsx`, and `SchedulesTab.tsx` and the three colocated test suites stay untouched. The per-module header comments that hand-track the equivalence are updated to point at the shared rule instead.

Widening the plugin boundary regex to admit `web/src/shared/` was rejected: it would open every shared host module to every plugin, which is the reach the boundary exists to deny. Publishing one named function through `api.ts` keeps the surface explicit.

`api.ts` is already in the entry bundle (the plugin host builds capabilities from it) and the sessions and conversations chunks already import it at runtime for `ConfirmDialog`, so the schedules chunk importing it adds nothing new to any bundle.

## Implementation

1. Add `web/src/shared/list-selection.ts` exporting `nextListSelection(length: number, selected: number | null, key: string): number | null` with the clamp the three copies implement, and a header comment stating the rule (no wrap, Home/End to the ends, `null` for an empty list, other keys unchanged).
2. Add `web/src/shared/list-selection.test.ts` (see Tests).
3. Re-export it from `web/src/plugins/api.ts` beside the other published shared helpers, with a one-paragraph note on why.
4. In `conversation-list-keys.ts`, `sessions-keys.ts`, and `schedules-keys.ts`, replace the function with a renaming re-export, `export { nextListSelection as <existingName> } from '../api';` (the `export … from` form `unicorn/prefer-export-from` requires), and update each module's comments.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- **`web/src/shared/list-selection.test.ts`**, mirroring `schedules-keys.test.ts`'s style: ArrowDown steps forward and clamps at the last index; ArrowUp steps back and clamps at zero; with no prior selection ArrowDown/ArrowUp start from index 0; Home and End jump to the ends; an unrelated key returns the selection unchanged (including `null`); an empty list returns `null` for every key; a single-row list keeps every navigation key on row 0.
- **`web/src/plugins/api.test.ts`**: one case asserting the published `nextListSelection` is the shared module's function, so a plugin reaching it through the API gets the one rule.
- `conversation-list-keys.test.ts`, `sessions-keys.test.ts`, `schedules-keys.test.ts`, the three list component tests, and `src/eslint-plugin-boundaries.test.ts` must pass unchanged.

## Out of scope

- The three components' own `NAVIGATION_KEYS`/`NAV_KEYS` sets; the backlog entry leaves the call sites untouched.
- The file navigator's richer `handleFileNavigatorKey` in `web/src/file-navigator/file-navigator-keys.ts`.
- The click-selection helpers (`conversationClickSelection`, `sessionClickSelection`), which are a separate duplicate not named by this item.
- Any change to `eslint.plugin-boundaries.mjs` or `TAB_PLUGIN_API_VERSION`.

## Verification

- `./scripts/run.mjs check-diff` passes.
- A search for `Math.min(index + 1, length - 1)` under `web/src` finds only `web/src/shared/list-selection.ts`.

## Documentation and specification impact

None. This is a pure refactor; the lists' keyboard behavior is unchanged, so no spec, `help.md`, or user documentation update is needed.
