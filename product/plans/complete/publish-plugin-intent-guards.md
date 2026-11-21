# Publish the repeated plugin intent guards from the plugin API

**Complexity: 6/10** — 18 production files edited (8 shared modules, 8 activation modules, the guard module and the plugin API), ~20 lines added, 5 requirements and 12 test scenarios (p=5.755); broad but mechanical, with no new architecture.

`isEmptyIntent` is written out in the shared modules of the connections, conversations, launcher, models, and sessions plugins; `isRefreshIntent` in commands, diff, and hosts; and `isIdIntent` in connections and conversations with two different rules. These are the guards that decide whether an intent payload is well formed, so two copies that drift let the same malformed request be accepted by one plugin and rejected by another. They belong to the published plugin contract, the way `isRecord`, `isModelPair`, and `isShellMarkerNonce` already do: defined once in `src/value-guards.ts` and re-exported from `src/plugins/api.ts`.

## Goal

There is one definition each of `isEmptyIntent`, `isRefreshIntent`, and `isIdIntent`. Server plugin activation modules import them from the published API instead of from a local copy in their `shared.ts`, and every plugin applies the same rule to the same intent payload shape.

## Design decisions

**Publish from `value-guards.ts`, re-export from `api.ts`.** `src/value-guards.ts` is the home of the shared, browser-safe predicates (`isRecord`, `isModelPair`, `isShellMarkerNonce`), and `src/plugins/api.ts` already re-exports them beside the `isRecord` re-export. Adding the three guards there and re-exporting them the same way keeps one implementation and one published entry point, and keeps them importable by both sides of the plugin boundary.

**`isRefreshIntent` is an alias of `isEmptyIntent`.** Both names describe a payload that is a plain JSON object with zero own keys. They stay separate names because the intent name in each plugin is separate (`refresh` vs `clear`-style empty payloads), but they resolve to the same function, so the rule cannot drift.

**`isIdIntent` uses one rule: a plain object whose only own key is a string `id`.** The connections form already has this rule; the conversations form only checks `typeof value.id === 'string'` and accepts extra keys. The strict rule is the safer one and matches the other hand-written intent guards and `isEmptyIntent`. Tightening conversations is a deliberate behavior change: `{ id, extra }` goes from accepted to rejected there. Both clients send exactly `{ id }`, so no legitimate caller is affected.

**The guards move out of `shared.ts`, not re-export through it.** A plugin's `shared.ts` ships in that plugin's client lazy chunk through `@shared`; importing `src/plugins/api.ts` from it at runtime would pull `api.ts` and its `node:crypto`-backed helpers into the browser graph. The intent guards are server-only (no web code imports them), so the activation modules import them from `../api.js` directly. `shared.ts` keeps only the payload guards and types the client actually uses.

**`object()` in `connections/shared.ts` stays.** It is a local record predicate used by the client-side payload guards, the same pattern every other plugin's `shared.ts` uses. Replacing it with the published `isRecord` would require `connections/shared.ts` to import `api.ts` into the browser graph; that import is exactly what these modules avoid. The published `isRecord` continues to serve server-side callers such as `src/plugins/hosts/hosts-values.ts`.

## Implementation steps

1. In `src/value-guards.ts`, add `isEmptyIntent` (an `isRecord` check plus zero own keys), `isRefreshIntent` (an alias of `isEmptyIntent`), and `isIdIntent` (an `isRecord` check, exactly one own key, `id`, whose value is a string). Keep the type predicates narrow enough for the `defineIntents` tables (`Record<string, never>` / `{ id: string }`).
2. In `src/plugins/api.ts`, re-export the three new guards beside the existing `isRecord` re-export.
3. In each shared module, delete the local guard definition(s) only: `connections/shared.ts` (`isEmptyIntent`, `isIdIntent`), `conversations/shared.ts` (`isEmptyIntent`, `isIdIntent`), `launcher/shared.ts` (`isEmptyIntent`), `models/shared.ts` (`isEmptyIntent`), `sessions/shared.ts` (`isEmptyIntent`), `commands/shared.ts` (`isRefreshIntent`), `diff/shared.ts` (`isRefreshIntent`), `hosts/shared.ts` (`isRefreshIntent`). Leave every payload guard, type, and local predicate otherwise untouched.
4. In each matching activation module, import the guards it uses from `../api.js` rather than `./shared.js`: `connections/activate.ts`, `conversations/activate.ts`, `launcher/activate.ts`, `models/activate.ts`, `sessions/activate.ts`, `commands/activate.ts`, `diff/activate.ts`, `hosts/activate.ts`. Extend the existing `../api.js` import where one is already present.
5. Update the shared-module tests that import the guards from `./shared.js` to import them from `../api.js`: `connections/shared.test.ts`, `launcher/shared.test.ts`, `models/shared.test.ts`, `hosts/shared.test.ts`. Keep their assertions unchanged.
6. Run `$janissary/scripts/run.mjs check-diff` after each step and fix any failure before continuing.

## Tests

Add a `describe` block to `src/value-guards.test.ts` covering the published guards directly:

- `isEmptyIntent`: `{}` accepted; `[]`, `null`, a string, a number, and an object with an extra key rejected.
- `isRefreshIntent`: the same table as `isEmptyIntent`, pinning the alias.
- `isIdIntent`: `{ id: 'x' }` accepted; `{ id: 'x', extra: true }`, `{ id: 1 }`, `{}`, `[]`, and `null` rejected.

The existing guard assertions in the four shared-module tests keep passing (only their import source changes). The existing `src/plugins/conversations/activate.test.ts` intent path stays green with the tightened `isIdIntent`.

## Out of scope

- Any change to payload guards, schema versions, or the wire contract.
- The local record predicates in client `shared.ts` modules, including `object()` in `connections/shared.ts`.
- `src/plugins/sql/shared-intents.ts`, which keeps its own `isRefreshIntent` in a separate, non-`shared.ts` module not named by the debt item.
- Any change to intent names, refusal wording, or `TAB_PLUGIN_API_VERSION`; this is an internal deduplication, not a published API change.
