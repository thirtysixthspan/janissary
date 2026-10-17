# System schedules 05: client-reported shell exit generations

**Complexity: 6/10**: an additive close/status contract passes a PTY generation through the retained plugin body, center and sidebar composition, app close guards and the existing RPC, while preserving ordinary zero-argument close behavior.

This completes 04's server-owned PTY recovery path by making client process-exit and mount-status reports generation-specific. It also preserves direct destructive close for an ordinary shell process exit.

## Goal

Carry the exited PTY id over the existing plugin close/status paths so stale callbacks cannot hide or close a replacement shell. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 (ordinary user-close/hide behavior), 03 (system-shell identity) and 04 (server recovery handler). Reuse those lifecycle seams.
- Extend the client plugin `close()` callback additively with optional `{ terminalExited: ptyId }` and carry it over the existing `closeTab` RPC. Zero-argument close remains an ordinary user close and retains 01's behavior. No new RPC or plugin API version is needed.
- The server accepts a reported exit only for the current shell-plugin payload generation when that PTY is no longer live and the tab is not closing. A stale id, live-PTY forgery, duplicate/already-handled id or closing tab is a no-op. For a system shell, route the validated id to 04's idempotent recovery handler; for an ordinary shell, keep destructive close behavior.
- A verified terminal process exit bypasses the client quit/unsaved-close confirmation. A last ordinary shell exit still closes directly and quits as before. Ordinary user close continues through the existing app guard and system hide path.
- Bind each attached terminal's exit callback to the PTY id captured when it attached. A callback retained by an old terminal must never read a replacement payload's id. Mount-time `terminal-status` sends the captured `{ ptyId }` and receives `{ ptyId, running }`; the client reports an exit only if the response id still matches that attachment and `running` is false. The server revalidates the later close reason.
- Forward the optional reason through both center and docked plugin bodies, `App`'s center close handler and the existing `closeTab` message. Keep tab-strip, keyboard, reporting-tab and all zero-argument plugin close callers reason-free.
- Keep the frozen v1 fixtures unchanged. The optional field is additive under the existing API v2 contract.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Server recovery | 04; `src/system-shell.ts`, `src/controller/events.ts` | Route a validated client id to the same handled-generation method; do not add a second recovery path. |
| Plugin close callback and app guard | `web/src/plugins/api.ts`, `web/src/App.tsx`, `web/src/CloseSaveGuard.tsx` | Preserve zero-argument user close; bypass client confirmation only for the optional actual-exit reason. |
| Existing close RPC | `src/protocol/core-rpc.ts`, `src/client-params/core.ts`, `src/message/tabs.ts`, `src/controller/tab-adapter.ts` | Add the optional PTY id to the existing request and validate it against server-owned payload/PTY state. |
| Retained terminal attachment | `web/src/plugins/shell/{useShellTerminal,useShellTabTerminal,useShellTerminalStatus}.ts` | Capture generation per attachment and ignore status replies for an old generation. |
| Center and docked plugin composition | `web/src/{MountedViewLayers,Sidebar}.tsx`, `web/src/plugins/{PluginBody,PluginTabLayer,DockedPluginBody}.tsx` | Forward the optional callback argument without creating another body or mount. |

## File scope

### Production edits

- Server: `src/system-shell.ts` to expose the validated-generation route from 04; `src/controller/tab-adapter.ts`; `src/protocol/core-rpc.ts`; `src/client-params/core.ts`; `src/message/tabs.ts`; `src/plugins/shell/{activate,shared}.ts` for the PTY-tagged `terminal-status` intent.
- Client: `web/src/App.tsx`, `web/src/AppMain.tsx`, `web/src/AppCenterActionArea.tsx`, `web/src/CenterActionAreaProps.ts`, `web/src/MountedViewLayers.tsx`, `web/src/Sidebar.tsx`; `web/src/plugins/api.ts`; `web/src/plugins/{PluginBody,PluginTabLayer,DockedPluginBody}.tsx`; `web/src/plugins/shell/ShellTab.tsx`; `web/src/plugins/shell/{useShellTabTerminal,useShellTerminal,useShellTerminalStatus}.ts`.

### Tests

- Server: edit `src/controller/tab-adapter.test.ts`, `src/client-params/core.test.ts`, `src/message/handler.test.ts` and `src/plugins/shell/{activate,shared}.test.ts`; add generation-validation coverage to `src/system-shell-recovery.test.ts` or its focused system-shell test.
- Client: edit `web/src/{App,MountedViewLayers,Sidebar}.test.tsx`, `web/src/plugins/{api.test.ts,PluginBody.test.tsx,PluginTabLayer.test.tsx,DockedPluginBody.test.tsx}`, and `web/src/plugins/shell/{ShellTab.test.tsx,useShellTerminal.test.ts}`. Add `web/src/plugins/shell/useShellTerminalStatus.test.ts` for captured and echoed generation handling.
- Run both frozen fixture suites unchanged: `src/plugins/fixture-v1/compatibility.test.ts` and `web/src/plugins/fixture-v1/compatibility.test.tsx`.

### Specs and documentation

- Update `product/specs/{shell-tab,tabs,tab-plugins,websocket-rpc}.md` for actual-exit versus user-close behavior and the optional close/status generation.
- Update `documentation/developer-documentation/tab-plugins.md`'s client close contract and API v2 changelog, plus user shell/tabs documentation for direct process-exit close behavior.

## Ordered changes

1. Extend the existing close RPC with an optional terminal-exit id and validate it against the tab's current payload generation and PTY liveness before acting.
2. Route a valid managed-system id to 04's recovery handler and a valid ordinary-shell id to the existing destructive close path. Preserve zero-argument close and bypass app close confirmations only for verified process exits.
3. Capture terminal ids in the attached exit/status callbacks and echo the status generation. Forward the optional reason through center and docked plugin composition.
4. Test stale, duplicate, live-PTY and closing-tab reports; keep ordinary close callers and frozen fixtures compatible. Update the named specs/docs.

## Tests and verification

Test close reason forwarding from terminal exit through center and docked plugin bodies, app guard bypass, RPC decoding and server validation. A delayed old attachment or status reply after replacement must not close/hide the new generation. A status response closes only when its echoed id matches and reports `running: false`; a forged id for a live process does nothing. Confirm ordinary zero-argument close still follows its prior behavior, an actual last ordinary shell process exit quits directly, and a valid system exit reaches 04 exactly once. Run `./scripts/run.mjs check-diff` and the frozen fixture suites if diff selection omits them.

## Boundaries

No PTY spawn/replacement implementation, profile filtering, project schedule storage, queue provenance or global close-path rewrite. Plan 04 owns the server recovery state machine; plan 06 owns profile isolation.
