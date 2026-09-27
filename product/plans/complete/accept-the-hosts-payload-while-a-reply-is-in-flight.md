# Accept the host's own payload so a reply in flight does not stop every tab repainting

The visualizations plugin's shared payload guard rejected a turn carrying `streaming: true`, which the host sets on the record the moment a message is accepted and copies onto the window it projects. `activate.ts` bails on the whole topic delivery when `isVisualizationsData` fails, so for as long as any visualization was working no tab repainted, the tab never learned it was busy, `dataFrom` called `reportFailure` and disabled the plugin outright, and a record persisted with the flag set — which `store.ts` deliberately allows — disabled the plugin on every later launch.

`src/plugins/visualizations/shared.ts`'s `isTurn` now accepts the flag as an optional boolean, the comment in `src/visualizations/store.ts` that claimed a payload never carries one is corrected, and the two shapes are pinned together by a test that builds the window the way `windowOf` builds one.

`src/plugins/visualizations/shared.test.ts` gains a case asserting a busy window with a streaming turn is accepted, and loses the one asserting it is refused. `web/src/plugins/visualizations/VisualizationTab.test.tsx` gains a case asserting that a busy window refuses Enter, leaves the typed text in place, and still cancels on Escape — the behaviour a rejected payload had prevented.

The host's streaming flag is unchanged: the tab needs it, and the record guard already accepted it.
