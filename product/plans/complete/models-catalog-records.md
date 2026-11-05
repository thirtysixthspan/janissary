# Model catalog records

**Complexity: 3/10** — this replaces the catalog's list shape with validated model records while preserving the existing lookup API during the staged migration.

## Goal

Change the bundled and project model catalogs from lists of ids to ordered lists of records, so each model can carry a display name and independent `disabled` and `hidden` flags. Keep existing server callers working until the later consumer-migration subplan.

## Decisions and dependencies

- Depends on the workspace's `models-tab` feature branch being prepared. No earlier subplan is required.
- A catalog is a plain object mapping each harness to an ordered array of records. Each record has a nonempty string `id`, an optional string `name`, and optional boolean `disabled` and `hidden` fields. The decoder rejects the entire catalog if any harness value or record is malformed; the encoder omits either flag unless it is `true`.
- Changing project overrides from id lists to records is breaking. Publish the implementation with a Conventional Commit subject that marks the break, such as `feat(models)!: store catalog entries as records`, so `scripts/release/changelog.mjs:48` (`breakingChanges`) includes it in the generated breaking-changes section.
- The project override replaces the bundled catalog wholesale. A missing override uses the bundled catalog. Invalid JSON prints `warning: .janissary/known-models.json is invalid JSON — using the bundled catalog`; an invalid record catalog, including an old id-list override, prints `warning: .janissary/known-models.json is not an object of model-record lists — using the bundled catalog`. Both invalid cases use the bundled catalog.
- Keep the existing `modelsFor`, `isKnownModel`, and `loadHarnessModels` exports as a compatibility layer for callers not migrated yet. `modelsFor` returns model ids and excludes disabled records; `isKnownModel` checks that launchable set, and `loadHarnessModels` remains the startup loader. Neither lookup excludes hidden records; `hidden` affects only the models-tab view. `models-catalog-consumers.md` removes this layer after `models-catalog-manager.md` lands.
- Keep source files below 200 counted lines, use `.js` extensions for relative imports in `src/`, and do not add a barrel module.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Current fallback, lookup, and bundled JSON import | `src/harness/models.ts:3` (JSON import with `type: 'json'`), `src/harness/models.ts:12` (`decodeHarnessModels`), `src/harness/models.ts:25` (`loadHarnessModels`), `src/harness/models.ts:43` (`modelsFor`), and `src/harness/models.ts:47` (`isKnownModel`); tests at `src/harness/models.test.ts:64` (`the bundled catalog`) and `src/harness/models.test.ts:107` (`loadHarnessModels`) |
| Startup load to retain during this subplan | `src/main.ts:76` (`loadHarnessModels(cwd)`) |
| Atomic persistence | `atomicWriteFile` in `src/atomic-write.ts:8` |
| Catalog source | `known-models.json:1`, the root object whose values are currently ordered string lists |
| Existing format description | `product/specs/harness.md:1034` (`Launching with a model and effort level`) and `product/specs/harness.md:1050` (`What the bundled catalog holds`) |

## Proposed changes

1. Add `src/models/catalog-file.ts` with the record/catalog types, the bundled catalog import, an all-or-nothing decoder, a pure encoder, `readCatalog(projectDirectory)`, and the catalog writer. Return the effective catalog, whether the project override supplied it, and the `.janissary/known-models.json` override path. The writer uses `atomicWriteFile` from `src/atomic-write.ts:8` and serializes two-space JSON with a trailing newline.
2. Convert each string in the bundled `known-models.json` to `{ "id": "…" }`, preserving harness and model order.
3. Adapt `src/harness/models.ts` to use the new decoder while retaining the current public lookup functions for the next subplan. Invalid records, including an empty id, non-string name, or non-boolean flag, invalidate the whole override.
4. Move and update `src/harness/models.test.ts` to `src/models/catalog-file.test.ts`. Cover bundled loading, wholesale override, both warning-and-fallback cases, every invalid record field, round-trip encoding, true-only flags, and ignoring a stale `.janissary/harness-models.json` file.
5. Update `product/specs/harness.md:1034` and `product/specs/harness.md:1050` to describe the record shape, wholesale override, fallback warnings, and the fact that the bundled records initially contain only `id`. Keep the existing hand-maintenance rules for the bundled catalog.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. The moved catalog tests must cover all cases above, including the writer's two-space JSON and trailing newline; existing callers must continue to compile against the compatibility API.

For a manual check, create `.janissary/known-models.json` in a scratch project with `{"claude":[{"id":"manual-disabled-model","disabled":true}],"codex":[],"opencode":[]}` and start Janissary on that project. Run `harness claude --model manual-disabled-model` and confirm it prints `Unknown model "manual-disabled-model" for harness "claude" — add it to known-models.json.` without opening a harness tab. Replace the file with `{"claude":[{"id":"bad-name","name":7}],"codex":[],"opencode":[]}` and restart Janissary. Confirm startup prints `warning: .janissary/known-models.json is not an object of model-record lists — using the bundled catalog`, then open the existing New harness dialog and confirm its Model dropdown includes the bundled `claude-sonnet-5` entry.

## Out of scope

- Provider fetching, refresh merging, the model manager, or runtime notification behavior.
- Removing the compatibility exports or migrating their consumers.
- The models tab, roles layout, help pages, and user documentation.
- Reading or migrating `.janissary/harness-models.json`.
