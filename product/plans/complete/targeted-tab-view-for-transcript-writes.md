# Targeted tab view for transcript writes

Complexity: 7/10

## Goal

Shell and ACP output should not rebuild and resend every tab. A transcript write sends only the changed tab's view.

## Approach

- `state: dirty` carries an optional `tab` label. `appendTab`, `updateRunningEntry` (when the tab exists), and `clearTranscriptTab` set it. Other subscribers of `dirty` are unaffected, because the event is still emitted.
- `wireControllerEvents` projects a labelled dirty to one `TabView` through a `tabView` lookup and sends it through a new optional `sendTabView` sink. An unlabelled dirty, a missing sink, or a tab that no longer projects falls back to the full `emitState` snapshot.
- `buildManagedTabView` in `src/tab/view.ts` is the single-tab projection, shared with `buildTabViews`. It is exposed through `view-operations`, `TabManager.tabView`, and `ControllerCore.tabView`.
- `ServerEvent` gains `tab-view-updated`; `src/index.ts` broadcasts it.
- The web client folds it into `latestState` by label (`mergeTabView`, reached through `mergePartialState` with the agent-run merge) and notifies `onState` subscribers. A label absent from the snapshot is ignored.

## Tests

- `src/tab/transcript/events.test.ts`: transcript dirty events carry the tab label; a missing tab still emits a plain dirty.
- `src/controller/tab-view-events.test.ts`: targeted send, unlabelled fallback, unprojectable-tab fallback.
- `web/src/shared/ws/tab-view-merge.test.ts` and `ws.test.ts`: merge by label, unknown label ignored, late subscribers see the merged snapshot.

## Out of scope

Unrelated state changes still send full snapshots, and a very large single tab still formats its whole capped buffer.
