# Inject the client plugin host instead of importing two module-level singletons

## Complexity

7/10 — a new injection seam (host value plus context provider) threaded through the plugin body, a capability builder's signature change, and four test files that exist in their current shape only because there is no seam today.

## Goal

`PluginBody` imports the process-wide plugin registry map and the module-level failure ledger directly and reads both during its render. The ledger is the hidden global §7 names: mutable module state, written from the capability object handed to every plugin, that no caller can construct, substitute, or scope. Failure state lives as long as the page — once any tab poisons a plugin id, every later tab for that id renders nothing until a reload — and because one map backs every test file, the suites stay honest only by remembering a global reset in `beforeEach`. A forgotten one silently disables a plugin in an unrelated case; the reverse hides a real regression.

Replace both imports with one host value the app shell owns and passes down.

## Approach

**A host value, not two singletons.** A new `web/src/plugins/host.tsx` exports `createPluginHost(registry?)`, returning `{ registry, failure(id), disable(id, reason) }` over a failure map the instance owns. The registry defaults to the existing `clientPluginRegistry`, so the production host is built from the same `createClientPluginRegistry` call as today and `registry.test.tsx` and `fixture-v1/compatibility.test.tsx` — which assert catalog parity and schema versions against that map — keep passing untouched.

**Injected through context.** The same module exports a `PluginHostProvider` and a `usePluginHost()` hook. The hook throws when no provider is mounted rather than falling back to a default instance: a fallback would be the hidden global again, just spelled differently. `web/src/main.tsx` constructs the host once at module scope, beside the client, and wraps `<App />` in the provider. Module scope, not inside the reconnect callback — the host must keep the page-long lifetime it has today, or a reconnect would quietly clear recorded failures.

`PluginBody` reads the host from context. `PluginTabLayer` and `DockedPluginBody`, the only two frames that render it, need no change at all — the context passes through them, which is the point of using one.

**Capabilities take the host.** `createPluginClientCapabilities` gains the host as its first parameter and calls `host.disable(...)` inside `reportFailure`, dropping its `disableClientPlugin` import. `registry.tsx` loses `failures`, `clientPluginFailure`, `disableClientPlugin`, and `clearClientPluginFailures` entirely — the reset export goes away with the global it existed to undo.

The residual risk is unchanged from the backlog entry's own assessment: the host still has run-long lifetime, so a test reusing one instance across cases can still carry failure state further than intended. What changes is that this is now visible in the test's own code rather than hidden in a module.

## Implementation

1. Add `web/src/plugins/host.tsx` with the `PluginHost` type, `createPluginHost`, `PluginHostProvider`, and `usePluginHost`.
2. Delete `failures`, `clientPluginFailure`, `disableClientPlugin`, and `clearClientPluginFailures` from `web/src/plugins/registry.tsx`.
3. Change `createPluginClientCapabilities` in `web/src/plugins/api.ts` to take a `PluginHost` first parameter and call `host.disable` in `reportFailure`.
4. In `web/src/plugins/PluginBody.tsx`, call `usePluginHost()`, pass the host into `createPluginClientCapabilities` (adding it to the memo dependencies), and read `host.failure(pluginId)` and `host.registry.get(pluginId)` where the imported functions were called.
5. In `web/src/main.tsx`, build the host at module scope and wrap `<App />` in `PluginHostProvider`.
6. Rework the four test files (below).
7. Run `./scripts/run.mjs check-diff` after each step.

## Tests

Each affected suite gets a fresh host per case instead of a global reset. All three component suites alias React Testing Library's `render` and define a local `render` that supplies the provider as a `wrapper`, so every existing call site — including `rerender`, which re-applies the wrapper — is unchanged and the diff stays on the seam rather than on 50 call sites.

- **`web/src/plugins/PluginTabLayer.test.tsx`** — replaces the `clientPluginRegistry as Map` cast and the `productionEntries` save/restore dance with a per-case `Map` handed to `createPluginHost`. The `registry.set('fixture', …)` lines become `entries.set(…)`; the `clearClientPluginFailures()` calls in `beforeEach`/`afterEach` go away. Every case keeps its current assertions.
- **`web/src/plugins/DockedPluginBody.test.tsx`** — the same treatment. It renders `Sidebar`, so the wrapper is what gets the host down to the docked body.
- **`web/src/plugins/api.test.ts`** — each case builds `createPluginHost()` and passes it as the new first argument. The two dedup cases (one report per plugin across tabs; one plugin's failure not silencing another's) share a host within the case, which is exactly what they are asserting; the `clearClientPluginFailures` hooks go away.
- **`web/src/MountedViewLayers.test.tsx`** — its `vi.mock('./plugins/registry')` no longer needs to fake `clientPluginFailure` and `disableClientPlugin`; it keeps supplying the fake lazy `clientPluginRegistry`, and the wrapper builds a host over it.
- **`web/src/MountedViewLayers.video-playback.test.tsx`** — mounts a real plugin tab without mocking the registry, so it needs the wrapper too, over a host on the default production registry. It asserts nothing about failures and keeps every case unchanged.
- **One new case in `web/src/plugins/PluginTabLayer.test.tsx`**: a plugin disabled in one host still renders under a second, independent host. That is the scoping the injected value buys and the module-level ledger could not express.

`web/src/plugins/registry.test.tsx` and `web/src/plugins/fixture-v1/compatibility.test.tsx` are untouched and must keep passing — they are the check that the production registry itself did not change.

## Out of scope

- Giving the host a narrower lifetime than the page (per-tab, or reset on reconnect). Failure state deliberately keeps the lifetime it has today; changing it is a behavior change, not this refactor.
- Threading the host to anything other than `PluginBody` and the capability builder.
- The server-side plugin registry and activation path.
- Any change to what `reportFailure` sends, when it deduplicates, or how the host detects load, schema, timeout, and render failures.

## Verification

- `./scripts/run.mjs check-diff` passes.
- `grep` shows no `clientPluginFailure`, `disableClientPlugin`, or `clearClientPluginFailures` anywhere in the tree.
- No test file casts `clientPluginRegistry` to a mutable `Map`.

## Documentation and specification impact

None. Plugin loading, failure reporting, and tab teardown behave exactly as they do today; nothing a user can observe changes.
