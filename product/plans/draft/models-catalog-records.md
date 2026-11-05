# Model catalog records

**Complexity: 3/10** — this replaces the catalog's list shape with validated model records while preserving the existing lookup API during the staged migration.

## Goal

Change the bundled and project model catalogs from lists of ids to ordered lists of records, so each model can carry a display name and independent `disabled` and `hidden` flags. Keep existing server callers working until the later consumer-migration subplan.

## Decisions and dependencies

- Depends on the workspace's `models-tab` feature branch being prepared. No earlier subplan is required.
- A record has a nonempty string `id`, optional string `name`, and optional boolean `disabled` and `hidden`. The writer emits either flag only when true.
- Changing project overrides from id lists to records is breaking. Publish the implementation with a Conventional Commit subject that marks the break, such as `feat(models)!: store catalog entries as records`, so `scripts/release/changelog.mjs` records it from the commit subject.
- The project override replaces the bundled catalog wholesale. Missing, invalid JSON, and invalid record shapes use the bundled catalog; invalid files print the exact warnings in the source plan.
- Keep the existing `modelsFor`, `isKnownModel`, and `loadHarnessModels` exports as a compatibility layer for callers not migrated yet. They return ids and exclude disabled records from launchable models. The later manager subplan removes this layer after every consumer moves.
- Keep source files below 200 counted lines, use `.js` extensions for relative imports in `src/`, and do not add a barrel module.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Current fallback and lookup behavior | `src/harness/models.ts` and `src/harness/models.test.ts` |
| Atomic persistence | `atomicWriteFile` in `src/atomic-write.ts` |
| Catalog source | `known-models.json` |
| Existing format description | `product/specs/harness.md`, sections “Launching with a model and effort level” and “What the bundled catalog holds” |

## Proposed changes

1. Add `src/models/catalog-file.ts` with the record/catalog types, an all-or-nothing decoder, a pure encoder, and `readCatalog(projectDirectory)`. Return the effective catalog, whether the project override supplied it, and the override path. Use `atomicWriteFile` for writes with two-space JSON and a trailing newline.
2. Convert each string in the bundled `known-models.json` to `{ "id": "…" }`, preserving harness and model order.
3. Adapt `src/harness/models.ts` to use the new decoder while retaining the current public lookup functions for the next subplan. Invalid records, including an empty id, non-string name, or non-boolean flag, invalidate the whole override.
4. Move and update `src/harness/models.test.ts` to `src/models/catalog-file.test.ts`. Cover bundled loading, wholesale override, both warning-and-fallback cases, every invalid record field, round-trip encoding, true-only flags, and ignoring a stale `.janissary/harness-models.json` file.
5. Update the catalog-format portion of `product/specs/harness.md`; keep the existing hand-maintenance rules for the bundled catalog.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. The moved catalog tests must cover all cases above; existing callers must continue to compile against the compatibility API.

## Out of scope

- Provider fetching, refresh merging, the model manager, or runtime notification behavior.
- Removing the compatibility exports or migrating their consumers.
- The models tab, roles layout, help pages, and user documentation.
- Reading or migrating `.janissary/harness-models.json`.
