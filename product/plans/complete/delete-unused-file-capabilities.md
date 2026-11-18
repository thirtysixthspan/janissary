# Delete the unused file-capabilities capability group

**Complexity: 1/10** — 1 module deleted, 1 comment edit, 1 behavioral requirement, 1 test scenario (p=3.03).

`src/plugins/file-capabilities.ts` is a dead copy of the capability group that `src/plugins/context.ts` now composes directly. Its `fileCapabilities()` duplicates `requireDeclaredTopic`, `topicActionCapability`, `projectFileList` and `openInEditor`, but has drifted from the live versions: it lacks the `root` result and `withRunAllocation` wrapping and calls `managers.openFile.edit` directly. Nothing in production imports it — the only importer is `src/plugins/topics.test.ts`, which builds a `fileContext` and asserts the same disabled topic-action behavior as the live `createPluginContext`, keeping both implementations and their drift alive. A completed plan note already records that nothing imports the module.

## Goal

Remove the dead capability group and the parallel test assertions that keep it alive. The capability set composed by `createPluginContext` in `src/plugins/context.ts` and the project file capabilities in `src/plugins/project-capabilities.ts` remain the single implementations, with their existing tests as the only coverage. No user-visible behavior changes.

## Implementation steps

1. Delete `src/plugins/file-capabilities.ts`.
2. In `src/plugins/topics.test.ts`: drop the `fileCapabilities` import; in the "resolves a disabled plugin Models Delete without calling the manager" test, remove the `fileContext = fileCapabilities({...})` setup and its `await expect(fileContext.topicAction(action)).resolves.toBeUndefined();` assertion, leaving the live `context.topicAction(action)` assertion and the `managers.models.delete` not-called assertion intact.
3. In `src/plugins/json-compatible.ts`, update the export comment that names the now-deleted `file-capabilities.ts` so it no longer points at a module that no longer exists.

## Tests

No new tests — the change removes a duplicated assertion over dead code, and the live behavior it shadowed is already covered:

- `src/plugins/topics.test.ts` — the remaining live `context.topicAction(action)` disabled-plugin assertion, plus the existing undeclared-topic and missing-capability cases.
- `src/plugins/context.test.ts` — disabled topic values and undeclared capability/topic refusals through the live context.
- `src/plugins/project-capabilities.test.ts` — `projectFileList` and `openInEditor` live behavior, including the disabled case.
- `./scripts/run.mjs check-diff` gates the change.

## Spec

No user-visible behavior changes — this is dead code removal. `Spec: none needed`.

## Out of scope

- Consolidating the separate `isJsonCompatible` definitions in `src/plugins/json-compatible.ts` and `src/plugins/tab-value.ts`.
- Any change to `createPluginContext`, `projectFileList`, `openInEditor`, or their live behavior.
- Deleting other unused modules not named by this item.
