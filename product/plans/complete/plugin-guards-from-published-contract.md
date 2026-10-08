# Point the plugin guard copies at the published contract guard

## Complexity

5/10 — the same two-line edit in thirteen server modules plus one client module, and one additive publication on each side. No logic changes anywhere; the breadth is the whole job, and the care is in not moving the frozen fixture or the colocated guard suites.

## Goal

`src/plugins/api.ts:423-426` re-exports `isRecord` and `isModelPair` with a comment saying they were published because every bundled plugin's `shared.ts` had its own copy of both, but thirteen server plugin modules and one client module still declare the identical predicate privately. The publishing half of that migration landed and the consuming half never ran, leaving both mechanisms in the codebase at once. The copies are byte-identical today, so nothing is broken; what would make it visible is a change to the published rule — rejecting a `null`-prototype object, say — that reaches the one plugin importing from the api while the other twelve keep the old answer, validating the same payload in conversations and failing it in search with nothing naming the difference. Give the guard one definition on each side of the plugin boundary.

## Approach

Delete the private `function isRecord` declaration from each of the thirteen server `shared.ts` modules and import the guard from `../api.js` instead, exactly as `src/plugins/conversations/shared.ts:1` already does — the proof a plugin can import it there under the boundary `eslint.plugin-boundaries.mjs` enforces. On the client, publish the same definition beside `nextListSelection` in `web/src/plugins/api.ts`, additive so `TAB_PLUGIN_API_VERSION` does not move, and point the one client copy — `web/src/plugins/asciicast/cast-stream.ts` — at it through `../api`. The client publication re-exports the canonical `src/value-guards.ts` definition through the existing `@shared` alias rather than writing a second one, so the two sides agree by construction instead of by comment. `src/plugins/fixture-v1/shared.ts` is left alone: `ai/guidelines/plugins-tabs.md` freezes that fixture.

## Implementation

1. In `web/src/plugins/api.ts`, publish the guard beside `nextListSelection` with the same "Additive, so `TAB_PLUGIN_API_VERSION` does not move" wording its neighbours carry: `export { isRecord } from '@shared/value-guards';`.
2. In `web/src/plugins/asciicast/cast-stream.ts`, delete the private `isRecord` and import it from `../api`.
3. In each of the thirteen server modules — `src/plugins/{asciicast,audio,image,markdown,page,pdf,schedules,search,sessions,shell,video}/shared.ts`, `src/plugins/sql/shared.ts` and `src/plugins/sql/shared-intents.ts` — delete the private `function isRecord` declaration and add `import { isRecord } from '../api.js';` as the module's first import, matching `conversations/shared.ts`. Four of them (`page`, `schedules`, `sessions`, `shell`) carry header comments claiming the module imports nothing, or must import nothing, because the client runs these guards through `@shared`; each of those comments is corrected to name the one sanctioned import, keeping the reason the rest of the module stays import-free. The `../api.js` route adds nothing new to the browser graph — `conversations/shared.ts` already pulls the same pure contract module into a client chunk through `@shared`.
4. Leave `src/plugins/fixture-v1/shared.ts` and its copy untouched.
5. Run `./scripts/run.mjs check-diff` after the client half and again after the server half.

## Tests

No new tests. The colocated guard suites that pin the accept and reject answers — `src/plugins/conversations/shared.test.ts`, `src/plugins/search/shared.test.ts`, `src/plugins/sql/shared.test.ts` — must pass without moving, since the published guard is the same implementation each copy already held: `typeof value === 'object' && value !== null && !Array.isArray(value)`. The client build is the check that the publication is additive and import-safe; nothing else changes.

## Out of scope

- `src/plugins/fixture-v1/shared.ts`, frozen as the v1 compatibility fixture.
- `isModelPair`: it has no second copy to remove, and `conversations/shared.ts` already imports the published one.
- Bumping `TAB_PLUGIN_API_VERSION`; the publication is additive.
- Any change to the guard's implementation, or to what any plugin accepts or rejects.

## Verification

- `./scripts/run.mjs check-diff` passes after each half.
- A search for `function isRecord` under `src/plugins/` finds only the frozen fixture's copy.
- A search for `from '../api.js'` in the thirteen server modules confirms each now reads the published guard, and `web/src/plugins/api.ts` publishes it on the client.

## Documentation and specification impact

None. The guard's answers are identical; no spec, `help.md`, or user documentation describes it.
