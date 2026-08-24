# Split protocol.ts into per-domain protocol modules

**Complexity: 5/10** — a type-only reorganization. No runtime logic changes and no behavior changes: every type keeps its name, its shape, and its import specifier for the 179 modules that consume it. The work is mechanical (move declarations into domain files, compose the two big unions from named per-domain pieces) and the compiler proves it complete — a dropped declaration or a domain group left out of the `RpcCall` union fails `npm run typecheck:diff` and the existing `CLIENT_METHODS` exhaustiveness check in `src/client-message.ts`. The rating is not lower only because the file sits at the server/client wire boundary and every consumer in both projects depends on its export surface staying intact.

## Goal

`src/protocol.ts` is 365 lines — nearly double the 200-line guideline in `ai/guidelines/code-guidelines.md` — and it is the highest-churn file in the repo (84 commits in the last 60 days). The reason is structural: one `TabView`, one `StateEvent`, and one 60-member `RpcCall` union hold every field and method across the file-navigator, schedule, monitor, editor, plugin, and core-tab domains. Any feature that adds an RPC edits the same union, so unrelated features collide in the same hunk of the same file.

Split the declarations into per-domain modules under `src/protocol/`, and leave `src/protocol.ts` as the wire-boundary module that composes the cross-domain unions (`RpcCall`, `ClientMessage`) and re-exports the domain types. A file-navigator RPC addition then lands in `src/protocol/file-navigator.ts` and a schedule addition in `src/protocol/schedule.ts`, so the two no longer conflict.

## Background: what already exists (reuse, don't rebuild)

| Need | Already in repo | Location |
| --- | --- | --- |
| Wire types shared server↔client | `src/protocol.ts`, imported by ~45 server modules as `./protocol.js` and by 134 web modules as `@shared/protocol` | `src/protocol.ts` |
| `@shared/*` → `../src/*` path alias (resolves subdirectories, not just top-level files) | `web/tsconfig.json:13`, `web/vite.config.ts:13`, `vitest.config.ts:73` | — |
| Runtime allow-list of every client RPC method, exhaustiveness-checked against the union | `CLIENT_METHODS` … `satisfies Record<ClientMessage['method'], true>` | `src/client-message.ts:3-64` |
| A `foo.ts` module sitting beside its own `foo/` directory of parts | `src/controller.ts` + `src/controller/`, `src/commands.ts` + `src/commands/` | — |
| Re-export of types defined elsewhere from `protocol.ts` | `export type { BufferLine, HarnessView, … }` from `./tab/types.js` | `src/protocol.ts:9` |

`protocol.ts` already both defines wire types and re-exports types owned by other modules; this plan keeps that role and moves the bulk of the definitions behind it.

### On `ai/guidelines/imports-and-barrel-files.md`

That guideline forbids inventing an `index.ts` re-export hub for application code, with one exception: a module that is a deliberate public surface at a boundary. `protocol.ts` is exactly that — the single declared contract between the Node server and the React client, already named by the `@shared/protocol` alias and already re-exporting `./tab/types.js` symbols today. This plan keeps it as that one boundary module rather than creating a new hub, and it stays a real module (it defines `RpcCall` and `ClientMessage`), not a pure re-export list. No `index.ts` is created, and no consumer's import specifier changes.

## Approach

Eight new files under `src/protocol/`, each owning one domain's types plus that domain's slice of the `RpcCall` union as a named `*RpcCall` type:

1. **`src/protocol/plugin.ts`** — `PluginTabView`, `PluginIntentRequest`, `PluginFailedRequest`; `PluginRpcCall` (`pluginIntent`, `pluginFailed`).
2. **`src/protocol/schedule.ts`** — `ScheduleView`, `AggregatedScheduleView`, `ScheduleLaunchView`; `ScheduleRpcCall` (`closeScheduleLaunch`).
3. **`src/protocol/monitor.ts`** — `SuggestionView`; `MonitorRpcCall` (`runSuggestion`, `rateSuggestion`, `resetMonitorContext`, `monitorContextSnapshot`).
4. **`src/protocol/editor.ts`** — `SuggestHunk`; `EditorRpcCall` (`saveFile`, `editorSync`, `resyncEditorTab`, `editorPersonas`, `editorSuggest`, `closeEditorConnection`).
5. **`src/protocol/file-navigator.ts`** — `FileOpenerChoice`, `FileOpenerResolution`, `FileSelectionAction`, `BulkConflictPolicy`, `BatchResult`, `BulkMoveResult`, `MoveConflict`, `UndoRedoResult`, `FileNavigatorSelectionRecord`; `FileNavigatorRpcCall` (the 18 `fileNavigator*`/`*FileNavigatorItem(s)`/`openFileNavigatorFor` methods).
6. **`src/protocol/tab.ts`** — `AcpRef`, `ConnectionView`, `RouteChooserView`, `HarnessLaunchView`, `QuestionKind`, `PendingQuestionView`, `TabView`.
7. **`src/protocol/events.ts`** — `StateEvent`, `PtyDataEvent`, `PtyExitEvent`, `RpcReply`, `ByeEvent`, `LayoutEvent`, `CollectTreeStateEvent`, `ServerEvent`.
8. **`src/protocol/core-rpc.ts`** — `CoreRpcCall`: the tab/pty/dialog/transcript methods that belong to no single feature domain (`init`, `command`, `setActiveTab`, `focusTab`, `closeTab`, `renameTab`, `editQueuedCommand`, `deleteQueuedCommand`, `moveTab`, `moveTabToOtherPane`, `reorderTab`, `reorderTabTo`, `toggleCollapse`, `chooseRoute`, `closeHarnessLaunch`, `answerQuestion`, `complete`, `resize`, `ptyInput`, `ptyResize`, `ptyKill`, `reportLayout`, `setDock`, `launchAgentFor`, `openTranscriptFor`, `openHarnessTranscriptFor`, `openAcpTranscript`, `projectFiles`).

`src/protocol.ts` then holds only: the `./tab/types.js`, `./completion/types.js`, and `./profile/types.js` re-exports it has today; `export type { … } from './protocol/<domain>.js'` for each domain's public types; and the two composed unions

```ts
export type RpcCall =
  CoreRpcCall | FileNavigatorRpcCall | EditorRpcCall | MonitorRpcCall | ScheduleRpcCall | PluginRpcCall;
export type ClientMessage = { t: 'rpc'; id: number } & RpcCall;
```

Every existing doc comment moves with the declaration it documents — comments are not dropped or rewritten. Every file lands well under the 200-line limit; the largest (`file-navigator.ts`) is roughly 100 lines.

No consumer changes. `import type { TabView } from './protocol.js'` and `import type { TabView } from '@shared/protocol'` both keep resolving to the same names.

## Implementation steps

1. Create `src/protocol/plugin.ts`, `schedule.ts`, `monitor.ts`, `editor.ts` — the four leaf domains with no inbound dependencies from the others. Relative imports carry `.js`.
2. Create `src/protocol/file-navigator.ts`, importing `FileNavigatorDetail` from `../tab/types.js` for the `fileNavigatorSetDetail` params.
3. Create `src/protocol/tab.ts`, importing `PluginTabView` from `./plugin.js`, `ScheduleView` from `./schedule.js`, `SuggestionView` from `./monitor.js`, and the view payload types from `../tab/types.js`.
4. Create `src/protocol/events.ts` and `src/protocol/core-rpc.ts`.
5. Rewrite `src/protocol.ts` as the composing/re-exporting boundary module.
6. Run `./scripts/run.mjs check-diff` after each step. The typecheck is the completeness proof: a missing re-export breaks the consumers that import it, and a domain group left out of `RpcCall` breaks the `satisfies Record<ClientMessage['method'], true>` check in `src/client-message.ts`.

## Tests

- `src/client-message.test.ts`: add a case asserting `isClientMessage` accepts one representative method from each protocol domain module (`fileNavigatorCollapseAll`, `editorSync`, `runSuggestion`, `closeScheduleLaunch`, `pluginIntent`, `command`). This is the runtime guard that every domain slice stays wired into the composed `RpcCall` union — if a domain file is dropped from the union, `CLIENT_METHODS` loses the corresponding key and the accepted-method assertions fail.
- No other new tests: the change is type-only, so the existing server and web suites (which import these types throughout) plus the typecheck are the coverage for the move itself.

## Out of scope

- Changing any wire type's name, shape, or semantics — this is a pure relocation.
- Changing consumer import specifiers to reach into `src/protocol/<domain>.js` directly. Doing so would touch 179 files for no behavior gain; `protocol.ts` remains the one wire-boundary import.
- Splitting `src/tab/types.ts`, `src/completion/types.ts`, or `src/profile/types.ts`.
- Adding, removing, or renaming any RPC method.
