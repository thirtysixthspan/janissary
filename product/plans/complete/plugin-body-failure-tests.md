# Bring the web client's plugin-tab failure paths under direct test

## Complexity

3/10 — a new colocated test file exercising components whose behavior is already pinned indirectly by `PluginTabLayer.test.tsx`; no source code changes at all.

## Goal

`web/src/plugins/PluginBody.tsx` and `web/src/plugins/host.tsx` carry the client side of the plugin failure-isolation contract — the `PluginErrorBoundary`, the five-second activation cap, the pre-mount `FailureEffect`, and the host's failure ledger — with no colocated test file. The server half of the contract has direct tests (`src/plugins/host.test.ts`, `src/plugins/failure.test.ts`, `src/plugins/teardown.test.ts`); the rendering half relies on whatever `PluginTabLayer.test.tsx` and the bundled plugin suites exercise through the layer above. This change adds `web/src/plugins/PluginBody.test.tsx` driving the component directly.

## Approach

One new test file, `web/src/plugins/PluginBody.test.tsx`, mirroring the conventions of `PluginTabLayer.test.tsx`: a per-case registry `Map` and host built in `beforeEach`, a local `render` alias that wraps children in `PluginHostProvider`, a stub `TabView` factory, and a fake `JanusClient` recording `send`. Plugin registrations come from `clientPlugin` over loaders resolving to stub components.

Cases:

1. **Clean mount** — a registration whose loader resolves to a plain component renders its output; `client.send` is never called.
2. **Render throw contained** — the plugin component throws during render. The `PluginErrorBoundary` catches it, `reportFailure` sends one `pluginFailed` message, the failed body renders nothing, and a sibling plugin tab (second `PluginBody` rendered alongside) continues to render — the isolation property, asserted at the component level rather than through the layer.
3. **Activation timeout** — `AbortSignal.timeout` is mocked with a manual `AbortController` (same rig as `PluginTabLayer.test.tsx`); the lazy import never resolves, the signal aborts, and exactly one `pluginFailed` with the `client activation timed out after 5000 ms` reason is sent. A follow-up assertion proves the failed plugin drops out of the render (no output node) while the sibling survives.
4. **Mounted-in-time is quiet** — the plugin mounts, then the shared deadline aborts; no failure is reported (guards against the cap firing after a successful mount).
5. **Unknown plugin id** — a `plugin` envelope whose id is absent from the registry flows a pre-mount failure through the `FailureEffect`: one `pluginFailed` with `unknown client plugin "…"`; rerendering does not report twice.
6. **Schema mismatch** — a registration whose `schemaVersion` differs from the envelope's reports the `payload schema … is not supported; expected …` reason once, and never invokes the loader.
7. **`usePluginHost` wiring** — rendering `PluginBody` without a `PluginHostProvider` above it throws the `no PluginHostProvider above this plugin` error (proves the component reads the host from context rather than a module global).

`web/src/App.test.tsx` and `web/src/MountedViewLayers.test.tsx` keep passing unchanged — `PluginBody` is mounted through them and no production code changes.

## Implementation

1. Write `web/src/plugins/PluginBody.test.tsx` with the cases above.
2. Run `./scripts/run.mjs check-diff`; fix any failures.

## Tests

The plan's entire substance is the test file listed above; each case in the Approach section is one `it` in it.

## Out of scope

- Any change to `PluginBody.tsx`, `host.tsx`, or the plugin contract.
- Server-side plugin tests.
- App-level integration tests beyond confirming the existing two suites stay green.
