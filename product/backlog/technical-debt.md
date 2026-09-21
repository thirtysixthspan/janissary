# technical-debt

## ready

## development

* Give every browser transport and resource request one session-token URL builder.

Existing Debt: `web/src/ws.ts`, `web/src/plugins/api.ts`, and `web/src/ws-connection.ts` independently read, encode, and place the same page session token even though the client class documents `resourceUrl` as the single location for that rule. Severity: 4/10

Existing Risk: 4/10 - A later change to authentication, URL encoding, or the endpoint query shape can update only one copy and leave plugin resources, ordinary file reads, or reconnects anonymously addressed, producing failures that depend on which surface made the request.

Proposal Risk: 2/10 - The WebSocket and HTTP endpoints still deliberately have different URL bases, so a future endpoint with genuinely different token semantics must extend the shared helper deliberately rather than inherit the existing rule by accident.

Proposal: Add a focused browser-only URL helper under `web/src/` that owns reading `location.search`, percent-encoding the token, and forming both the existing resource URL and the existing WebSocket URL without changing their current output. Have `JanusClient.resourceUrl` in `web/src/ws.ts`, the `resourceUrl` capability built by `createPluginClientCapabilities` in `web/src/plugins/api.ts`, and the socket construction in `web/src/ws-connection.ts` call it; retain the public `JanusClient.resourceUrl` and plugin capability APIs so plugin call sites remain unchanged. Move the repeated token cases currently asserted by `web/src/ws.test.ts` and `web/src/plugins/api.test.ts` to tests for the helper or retain one delegation assertion at each boundary, and add coverage that the socket URL still carries the encoded token.


* Extract remote-entry creation and frame/transport wiring from the remote lifecycle manager.

Existing Debt: `RemoteManager` in `src/remote/manager.ts` is 274 lines and combines the entry-table lifecycle with deferred PTY construction, handshake/frame dispatch, reconnect generation guards, readiness promises, and callback routing in one `create` method, exceeding the project's focused-module size guideline. Severity: 6/10

Existing Risk: 5/10 - Changes to provisioning or attach frames must modify a closure-heavy method beside shared-owner release and shutdown logic, making it easy to bind a callback to the wrong entry or alter teardown while changing only transport setup.

Proposal Risk: 3/10 - Remote setup still has mutually dependent channel and transport objects, so the extracted factory must retain its explicit deferred ownership and lifecycle callbacks to avoid hiding those ordering constraints.

Proposal: Move the construction pipeline from `RemoteManager.create` in `src/remote/manager.ts` into a focused `src/remote/` entry-factory module that creates the `RemoteChannel`, owns the deferred session/ready promise and generation guard, and returns the completed `RemoteEntry` plus its channel. Give that factory a narrow port for the manager-owned effects it needs: reporting a channel close against the exact entry and announcing session changes; keep the `entries` map, attach/release/detach/close operations, and their public API on `RemoteManager`, leaving `create` as the small registration and delegation path. Preserve the exported `RemoteLaunchHandlers` and `remoteServeCommand` surface used by `src/remote/manager.test.ts`, and keep its shared-channel, creator-label-reuse, attach, detach, and browser-exit cases passing because they cover the callback identity and lifecycle ordering the extraction must not change.


* Replace the file navigator drag hook's legacy positional overload with one named options contract.

Existing Debt: `web/src/file-navigator/useFileNavigatorDrag.ts` accepts two incompatible positional call shapes, detects the old one at runtime with string-versus-ref checks, and carries nine ordered parameters plus compatibility casts although `web/src/file-navigator/FileNavigatorTab.tsx` is the sole production caller and uses the newer shape. Severity: 5/10

Existing Risk: 5/10 - Adding a drag destination or changing root handling can silently bind a reference or path to the wrong positional slot, leaving a drop target unresponsive or causing a file move to use the wrong relative-path context without a type error at the call site.

Proposal Risk: 2/10 - The hook still coordinates several drop destinations and global gesture listeners, so regressions remain possible in destination-specific behavior, but named fields make omitted or misrouted inputs visible to TypeScript and reviewers.

Proposal: Define a named options type beside `useFileNavigatorDrag` in `web/src/file-navigator/useFileNavigatorDrag.ts` for `absoluteRoot`, `displayRoot`, `targetCwd`, command-bar and editor refs, and optional remote host; remove the `legacy` branch, union parameters, defaults that masquerade as old-call support, and the compatibility cast. Update `web/src/file-navigator/FileNavigatorTab.tsx` to pass that object, then convert the direct hook construction in `web/src/file-navigator/useFileNavigatorDrag.test.ts` through a small fixture or explicit options objects so each test states the inputs it depends on. Preserve the tests for ordinary moves, command-bar/editor/harness drops, remote path formatting, conflict flow, and mouse-up/blur/Escape/unmount cleanup, since those cover the behavior that must remain unchanged while the call boundary changes.

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
