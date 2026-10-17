# System schedules 05: client-reported shell exit generations

**Complexity: 6/10** — several existing client, plugin and RPC seams must carry a validated PTY generation without changing ordinary zero-argument close behavior; plan 04 already owns system-shell recovery.

This completes 04's server-owned PTY recovery path by making client process-exit and mount-status reports generation-specific. It also preserves direct destructive close for an ordinary shell process exit.

## Goal

Carry the exited PTY id over the existing plugin close/status paths so stale callbacks cannot hide or close a replacement shell. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 (ordinary user-close/hide behavior), 03 (system-shell identity) and 04 (server recovery handler). Reuse those lifecycle seams.
- Add an optional exit-reason argument to the existing `TabPluginClientCapabilities.close` callback, not a new capability or RPC: `{ terminalExited: ptyId }`. This is an additive optional argument within API v2 under `ai/guidelines/plugins-tabs.md`'s compatibility rule; keep `TAB_PLUGIN_API_VERSION` unchanged. Existing `close()` calls remain ordinary closes.
- Add optional `terminalExited` to the existing `closeTab` parameters in the single wire contract at `src/protocol/core-rpc.ts`; keep method name and label lookup unchanged. The server accepts the reason only when the tab is still the shell plugin, its current payload has that exact PTY id, the id is no longer live, and the tab is not closing. Stale ids, live-PTY reports, duplicate/already-handled ids and closing tabs are no-ops. A valid system-shell report may call only plan 04's idempotent `SystemShellManager.handlePtyExit`; it must not implement another recovery path. A valid ordinary-shell report follows destructive close behavior.
- A verified terminal process exit bypasses both `App`'s quit confirmation and `CloseSaveGuard`'s unsaved-close confirmation. A last ordinary shell exit still closes directly and quits as before. Ordinary user close continues through the existing app guard and system hide path.
- Bind each attached terminal's exit callback to the PTY id captured when it attached; never use the latest payload or a mutable callback ref to infer the old attachment's generation. Mount-time `terminal-status` sends `{ ptyId }` and receives `{ ptyId, running }`. The server answers with the requested id only when it matches the current shell payload; the client reports exit only if the echoed id matches its attachment and `running` is false. The close handler revalidates the later reason against current payload and PTY liveness.
- Forward the optional reason through center and docked plugin bodies, `App`'s close path, and `CloseSaveGuard`'s final close send. Keep tab-strip, keyboard, reporting-tab and all existing zero-argument plugin close callers reason-free. In `web/src/plugins/page/PageTab.tsx`, keep the close-button handler as `onClick={() => close()}`: passing the optional-argument callback directly would send React's click event as the close reason instead of preserving this caller's zero-argument semantics.
- Keep `src/plugins/fixture-v1/activate.ts` and both frozen v1 fixture suites unchanged. The optional `close` argument is additive under API v2; do not add a new public method or increment the API version. Record the additive API-v2 contract note in the tab-plugin reference/changelog.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Server recovery | 04; `src/system-shell.ts`, `src/controller/events.ts` | Route a validated client id to the same handled-generation method; do not add a second recovery path. |
| Plugin close callback and app guard | `web/src/plugins/api.ts`, `web/src/App.tsx`, `web/src/CloseSaveGuard.tsx` | Preserve zero-argument user close; bypass client confirmation only for the optional actual-exit reason. |
| Existing close RPC and sole wire contract | `src/protocol/core-rpc.ts` (`CoreRpcCall.closeTab`), `src/client-params/core.ts` (`CORE_PARAMS.closeTab`), `src/message/tabs.ts` (`dispatchTabMessage`), `src/controller/tab-adapter.ts` (`closeTab`) | Add the optional PTY id to the existing request and validate it against server-owned payload/PTY state; do not add another method or locally mirror its type. |
| Existing API-version policy | `src/plugins/api.ts` (`TabPluginClientCapabilities.close`), `ai/guidelines/plugins-tabs.md` ("Import boundaries and versioning") | Treat an optional argument on this existing callback as additive API v2; leave the API integer and frozen v1 fixtures unchanged. |
| Retained terminal attachment | `web/src/plugins/shell/{useShellTerminal,useShellTabTerminal,useShellTerminalStatus}.ts` | Capture generation per attachment and ignore status replies for an old generation. |
| Center and docked plugin composition | `web/src/{MountedViewLayers,Sidebar}.tsx`, `web/src/plugins/{PluginBody,PluginTabLayer,DockedPluginBody}.tsx` | Forward the optional callback argument without creating another body or mount. |

## File scope

### Production edits

- Server: `src/controller/tab-adapter.ts`; `src/protocol/core-rpc.ts`; `src/client-params/core.ts`; `src/message/tabs.ts`; `src/plugins/shell/{activate,shared}.ts` for the generation-bound `terminal-status` intent. `src/system-shell.ts` already exposes 04's `handlePtyExit`; reuse it without changing its event ownership or adding another recovery callback/path.
- Client: `web/src/App.tsx`, `web/src/AppMain.tsx`, `web/src/AppCenterActionArea.tsx`, `web/src/CenterActionAreaProps.ts`, `web/src/MountedViewLayers.tsx`, `web/src/Sidebar.tsx`, `web/src/CloseSaveGuard.tsx`; `web/src/plugins/api.ts`; `web/src/plugins/{PluginBody,PluginTabLayer,DockedPluginBody}.tsx`; `web/src/plugins/page/PageTab.tsx` (retain the click wrapper so React's event is not passed as an optional close reason); `web/src/plugins/shell/ShellTab.tsx`; `web/src/plugins/shell/{useShellTabTerminal,useShellTerminal,useShellTerminalStatus}.ts`.

### Tests

- Server: edit `src/controller/tab-adapter.test.ts`, `src/client-params/core.test.ts`, `src/message/handler.test.ts` and `src/plugins/shell/{activate,shared}.test.ts`; add generation-validation coverage to existing `src/system-shell.test.ts` (the 04 manager owner), not a second recovery module/test path. Test the `closeTab` decoder and handler through the existing RPC dispatch.
- Client: edit `web/src/{App,MountedViewLayers,Sidebar}.test.tsx`, `web/src/CloseSaveGuard.test.tsx` or `.named-close.test.tsx`, `web/src/plugins/{api.test.ts,PluginBody.test.tsx,PluginTabLayer.test.tsx,DockedPluginBody.test.tsx}`, `web/src/plugins/page/PageTab.test.tsx` (strengthen the existing “clicking the close button closes this tab” test to assert `close` receives no arguments), and `web/src/plugins/shell/{ShellTab.test.tsx,useShellTerminal.test.ts}`. Add `web/src/plugins/shell/useShellTerminalStatus.test.ts` for captured and echoed generation handling. Exercise all remaining zero-argument close callers as regressions without changing their reasons; do not add a separate PageTab test for the existing click behavior.
- Run both frozen fixture suites unchanged: `src/plugins/fixture-v1/compatibility.test.ts` and `web/src/plugins/fixture-v1/compatibility.test.tsx`.

### Specs and documentation

- Update `product/specs/{shell-tab,tabs,tab-plugins,websocket-rpc}.md` for actual-exit versus user-close behavior, the optional close reason and generation-echoed status intent. Keep plan 04's server `pty:exit` ownership explicit.
- Update `documentation/developer-documentation/tab-plugins.md`'s client close callback contract and API v2 changelog (classify as additive with no version increment), plus `documentation/user-documentation/command-bar/shell.md` and `documentation/user-documentation/getting-started/tabs.md` for direct process-exit close behavior.

## Ordered changes

1. Extend the existing `closeTab` wire request in `src/protocol/core-rpc.ts` and its `CORE_PARAMS` decoder with optional `terminalExited`; carry it through existing dispatch/adapter into one server validation point. A missing reason takes the unchanged user-close path.
2. Route only a valid system-shell reason to `SystemShellManager.handlePtyExit` from plan 04; it owns deduplication, hide and recovery. Route a valid ordinary-shell reason through destructive close. Bypass `App` and `CloseSaveGuard` confirmations only for the validated process-exit intent; preserve direct last ordinary-shell exit and quit semantics.
3. Capture terminal ids in attachment-specific callbacks and status requests, echo the status generation from the server, and report only a matching exited generation. Forward the optional reason through center/docked composition and the close guard's eventual send.
4. Test stale, duplicate, live-PTY and closing-tab reports; preserve ordinary close callers and frozen fixtures. Update the named specs and docs, including the additive API-v2 changelog entry.

## Tests and verification

Test close reason forwarding from terminal exit through center and docked plugin bodies and `CloseSaveGuard`; prove only verified process exits bypass quit/unsaved-close confirmation. A delayed old attachment or status reply after replacement must not close or hide the new generation. A status response is actionable only when its echoed id matches and `running` is false; a forged id for a live process does nothing. Confirm ordinary zero-argument close keeps 01's hide/close behavior, an actual last ordinary-shell process exit closes directly and quits, and a valid system exit is handled by plan 04 exactly once even if its client report races the `pty:exit` event. Run `./scripts/run.mjs check-diff`, `git diff --check` and both frozen fixture suites if diff selection omits them. Manual end-to-end check in a scratch project: type `exit` in the last ordinary shell and confirm it closes/quits without confirmation; type `exit` in the system shell and confirm plan 04 hides and replaces the same managed tab once.

## Boundaries

No PTY spawn/replacement implementation, profile filtering, project schedule storage, queue provenance or global close-path rewrite. Plan 04 owns the server recovery state machine; plan 06 owns profile isolation.
