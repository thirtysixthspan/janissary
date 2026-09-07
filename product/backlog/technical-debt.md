# technical-debt

## ready


* Pass named state snapshots through the websocket client subscription boundary.

Existing Debt: The client converts the shared state event into sixteen positional arguments and redeclares their types and optionality, making every snapshot field change require synchronized edits across a second contract. Severity: 6/10

Existing Risk: 5/10 - Swapping adjacent string fields or omitting a newly added field can silently feed the wrong UI state while the positional callback still satisfies its types.

Proposal Risk: 2/10 - Named fields remove positional ambiguity and preserve shared optionality, though the individual React setters still need explicit wiring for new state.

Proposal: Change `StateListener` in `web/src/ws.ts` to accept the shared `StateEvent` from `src/protocol/events.ts`, available through `src/protocol.ts`, and have the `state` arm of `JanusClient.onEvent` forward a named snapshot. Preserve its deliberate null normalization for `route`, `harnessLaunch`, and `scheduleLaunch`. Destructure the named event in `web/src/useServerState.ts`, remove the duplicated optional `activeTabNameMaxLength` contract and its fallback for a field required by the shared event, and preserve route-choice initialization and project-title updates. Update listener fixtures and assertions in `web/src/ws.test.ts`, `web/src/useServerState.test.ts`, and `web/src/App.test.tsx`; add a complete snapshot with distinct values for adjacent string and numeric fields to pin the fan-out. Keep this increment confined to the subscription boundary rather than restructuring the app's state storage.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
