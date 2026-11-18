# Offer the latest fetched models in the roles tab's model picker

**Complexity: 2/10** — ~6 added lines in 1 file, 3 requirements, 2 test scenarios (p=3.68)

The roles tab's **Add model** picker offers the enabled models of the launch catalog the host hands it through `harnessLaunchCatalog`. That capability answers from the model manager's in-memory catalog, which is only re-read from `known-models.json` when `models` runs and at the start of a Models-tab Delete or Refresh. A catalog that was refreshed and written by another Janissary process (another window or workspace on the same project), or edited by hand, therefore never reaches the roles picker: opening `roles` shows the models this process loaded at startup, and the `Not in the model catalog` markers are computed against the same stale list. The Models tab avoids this because its command asks the host to reload before it opens; the roles tab cannot, and should not be granted `topicAction` to do so — its manifest test pins that it does not hold that capability, which would also let it delete models or rewrite command settings.

## Goal

Every time the roles tab reads the launch catalog — when `roles` opens or focuses the tab, after each edit is written, and on each `models`/`commands` delivery — the host re-reads the effective catalog file first, so the picker and the missing-model markers reflect the latest fetched catalog on disk. When the re-read finds a changed catalog, the usual `models` change is published, so every open Models view and other model consumer follows as well. The roles plugin's capabilities do not change.

## Approach

`harnessLaunchCatalog` in `src/plugins/context.ts` calls `managers.models.reload()` before building its answer, but only while the plugin is enabled — a revoked plugin still answers the empty catalog without touching the file. `ModelCatalogManager.reload` already does nothing when the file is unchanged, so the publication a reload triggers when it does change the catalog delivers one `models` notification to the roles plugin, whose republish re-reads the now-equal file and stops there; there is no loop.

## Implementation steps

1. `src/plugins/context.ts`: restructure `harnessLaunchCatalog` so an enabled plugin's call runs `managers.models.reload()` and then builds `models` from `modelsFor`; a disabled plugin returns `{ models: {}, efforts }` without reloading. Update the comment above it to say the catalog is re-read from the catalog file on each call.

## Tests

- `src/plugins/context.test.ts`: give the `makeManagers` fake model manager a `reload` spy.
  - An enabled plugin's `harnessLaunchCatalog()` call invokes `reload` before reading, and returns the models the reload installed (the fake `reload` swaps the catalog, and the answer carries the swapped list).
  - A revoked plugin's call does not invoke `reload` and still answers the empty catalog.

## Specs and docs

- `product/specs/roles.md`: state that the picker and the missing-model markers read the effective catalog file fresh whenever the tab reads the catalog, so a catalog refreshed elsewhere appears without running `models`.
- `product/specs/models-tab.md`: add the roles tab's catalog reads to the list of moments the catalog is re-read.

## Out of scope

- Watching `known-models.json` continuously for changes while no consumer reads it.
- Granting the roles plugin `topicAction`, or triggering a provider Refresh from the roles tab.
- Clearing an open picker's selected model when a catalog change removes it.
