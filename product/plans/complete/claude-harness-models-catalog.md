# Populate the claude harness's model catalog

**Complexity: 1/10** — a data-only addition to a JSON file already read by existing code, plus one test update and one spec line update; no new logic, no new call sites.

## Goal

`harness-models.json` currently has only an `opencode` catalog. `isKnownModel('claude', <any model>)` therefore always returns `false`, so `harness claude --model ...` (once that flag exists) or a profile harness entry with `harness: "claude"` and any `model` set is always rejected with `Unknown model "<model>" for harness "claude" — add it to harness-models.json.`, regardless of the value. This adds the known Claude Code model catalog so real Claude model ids validate successfully.

## Approach

Add a `"claude"` key to `harness-models.json` listing the current Claude Code model ids: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. `modelsFor`/`isKnownModel` (`src/harness/models.ts`) already read the catalog generically via `Record<string, string[]>` — no code change needed there.

## Implementation

1. **`harness-models.json`**: add a `"claude"` array alongside the existing `"opencode"` array, listing the four model ids above.
2. **`src/harness/models.test.ts`**: the existing test `returns an empty list for an unknown harness` and `rejects an unknown harness` both use `'claude'` as their example of an *unknown* harness — now that `claude` is a known harness, switch those two assertions to a harness name that stays unknown (e.g. `'codex'`, which also has no catalog entry), and add new assertions covering the populated `claude` catalog: `modelsFor('claude')` contains `claude-sonnet-5`, and `isKnownModel('claude', 'claude-sonnet-5')` is `true`.
3. **`product/specs/harness.md`**: update the "Launching with a model" section, which currently reads "currently only opencode's model catalog is populated", to reflect that `claude`'s catalog is now populated too.

## Tests

`src/harness/models.test.ts`:
- `modelsFor('claude')` contains `claude-sonnet-5`.
- `isKnownModel('claude', 'claude-sonnet-5')` is `true`.
- `isKnownModel('claude', 'not-a-real-model')` is `false`.
- Update the two existing "unknown harness" assertions to use `'codex'` instead of `'claude'`, since `'claude'` is no longer an unknown harness.

Run `./scripts/run.mjs check-diff`.

## Out of scope

- Adding a `--model` flag to the interactive `harness <name>` command or an `effort` field — covered by the separate draft plan `harness-launch-model-and-effort.md`.
- Populating a `codex` catalog.
- Any change to `src/harness/models.ts`'s logic — the existing generic lookup already supports any harness key.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: not applicable beyond the unit tests — this is a pure data change exercised entirely by `isKnownModel`/`modelsFor`.
