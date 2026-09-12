# Give the plugin contract one declared intent table

## Complexity

5/10 — a new contract helper with generics over the plugin's payload and per-entry payload types, the first plugin migrated onto it, and a colocated test; behavior-preserving by construction, checked by the image plugin's unchanged suite.

## Goal

`TabPluginActivation.intent` is a single raw callback, so each bundled plugin re-implements the identical preamble by hand — re-applying its own `isPayload` guard to `request.tabPayload`, branching on `request.intent` string by string, calling a per-intent payload predicate, and ending in a `rejectRequest('unknown <plugin> intent …')` fallback. The checks a plugin must perform are conventions rather than contract: skipping the payload predicate hands unvalidated client input straight to a filesystem write, and omitting the unknown-intent fallback answers a bogus intent with a successful reply.

## Approach

Add `defineIntents(pluginId, isPayload, intents)` in a new `src/plugins/define-intents.ts`, re-exported from `src/plugins/api.ts` (the module itself, not a copy, because `api.ts` sits at the 200-line limit and the plugin import boundary restricts plugins to that surface). It performs the three shared steps once:

1. narrow `request.tabPayload` through the plugin's `isPayload` and `capabilities.reportFailure('invalid <plugin> tab payload')` when it does not hold;
2. look the intent name up in the table and `capabilities.rejectRequest('unknown <plugin> intent "…"')` when it is absent;
3. run the named entry's payload predicate and `capabilities.rejectRequest('invalid <intent> payload')` when it fails.

The returned callback is the `intent` member `TabPluginActivation` already requires. The existing raw `intent` callback stays in the type so nothing breaks.

Migrate exactly one plugin as the first increment — `src/plugins/image/activate.ts`, the smallest with one intent — leaving `audio`, `video`, `page`, `schedules`, and `conversations` for follow-up entries once the helper's shape has survived a real caller.

## Implementation

1. Write `src/plugins/define-intents.ts` with the helper and the `TabPluginIntentEntry` type; re-export both from `api.ts`.
2. Migrate `src/plugins/image/activate.ts`'s `intent` onto the table.
3. Add `src/plugins/define-intents.test.ts` covering the success path, the bad-tab-payload path, the unknown-intent path, and the bad-payload path.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

`src/plugins/define-intents.test.ts` is the new coverage: four cases, one per path. `src/plugins/intent.test.ts` pins how the host routes intents and `src/plugins/image/activate.test.ts` pins the image plugin's own rejections — both keep passing unchanged, which is the check that the migration is behavior-preserving.

## Out of scope

- Migrating the other five bundled plugins (follow-up entries).
- Any change to the wording of rejections or failure reports.
- Widening or versioning the plugin API (`TAB_PLUGIN_API_VERSION` does not move).
