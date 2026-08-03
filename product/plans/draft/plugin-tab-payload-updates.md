# Host-pushed payload updates for a live plugin tab

**Complexity: 3/10** — no new modules and no new wire surface: one capability and one tab operation, each added beside the creation path it mirrors, plus the three documents a test already pins to the capability list. The difficulty is in the boundaries — what an update may change, and what happens when its target is gone — not in the volume of work.

A bundled tab plugin can open a tab and can answer intents about it, but it cannot change what that tab shows once the tab exists. The payload is produced by the factory `openOrFocusTab` runs at creation (`src/plugins/context.ts:63`, `openOrFocusTab`) and is never written again, so every plugin view is effectively frozen at open time. That is the single missing capability behind two blocked migrations: an embedded browser tab whose url, domain, and strip name change when the user navigates it, and any view whose contents move on after the tab opened. The audio-player plugin sitting in `product/backlog/features.md` under `## development` needs the same thing for its playlist.

This plan adds an eighth v1 server capability, `updateTab(instanceKey, factory)`, that a plugin may call from any guarded handler — an opener, its declared command, or an intent — to replace the payload and, when it wants to, the title of a tab it already owns. The host resolves the tab by the plugin's own id plus the instance key, runs the factory, re-validates the result exactly as it validates a payload at creation, writes it onto the tab, and emits a state broadcast. Adding an optional capability is an additive change under `ai/guidelines/plugins-tabs.md` ("Additive optional declaration fields, capabilities, or hooks keep v1 compatible"), so `TAB_PLUGIN_API_VERSION` stays at 1 and every existing plugin keeps loading untouched.

The update path is deliberately request-driven: a plugin pushes while it is doing something the user asked for. That unblocks the embedded browser tab, whose navigation is a client action and therefore an intent. It does not by itself unblock a view whose data changes with no request in flight — a schedules tab redrawing because a schedule fired — which needs a mechanism reaching the host from a plugin's own background work. That is named in Open questions rather than smuggled into this plan.

## Design decisions

1. **A new server capability, `updateTab(instanceKey, factory)`.** It mirrors `openOrFocusTab`: the plugin names the instance key of the tab it wants to change and supplies a factory returning the new value. The alternatives were rejected deliberately — a live update handle held by the plugin would put host state in plugin hands across calls and require revocation on every close and disable, and an intent-returns-a-payload rule would tie every update to a client request and give openers and commands no way to change anything.

2. **Callable only from inside a guarded handler.** An update runs under the same 5000 ms per-call budget and failure boundary as every other capability (`src/plugins/host.ts`, `handlerTimeoutMs`; `src/plugins/invoke.ts`). A plugin that omits `updateTab` from its manifest and calls it anyway is a broken plugin: `restrictToDeclared` (`src/plugins/context.ts:32`) already replaces every undeclared capability with a thrower, and that path needs no new code — only a test proving it covers the new name.

3. **The factory may return a title as well as a payload.** They move together for the case that motivates this: a page tab that navigates changes its address and the name in the tab strip in one step, which is exactly what `navigatePageTab` does today (`src/tab/navigate.ts:14`, assigning `tab.page` and `tab.title` together).

4. **A returned title replaces whatever the tab's title currently is, including a user's rename.** `renameTabOp` (`src/tab/rename.ts:27`, `tab.title = trimmed`) and a pushed title write the same field, and the existing page tab already overwrites a user alias when it navigates. A factory that returns no title leaves the current title alone, so a plugin with nothing to say about naming never disturbs an alias. The title is not length-capped: creation-time titles are not capped either (`src/tab/creators.test.ts`, "retains a long filename as the complete tab title"), and `TAB_RENAME_MAX_LENGTH` governs user renames only.

5. **File references are fixed at creation.** An update cannot register a new file to serve. `registerFile` is available only inside the creation factory, which closes over `acceptingResources` and refuses late calls (`src/tab/openers.ts:53`, `'plugin tab resources are no longer available'`); growing the reference set over a tab's lifetime means the host must track and release additions on close, which neither blocked migration needs.

6. **The instance key never changes.** It is the tab's identity for reopening, profile capture (`src/profile/save-entries.ts`, `writePluginEntry`), and de-duplication, so an update addresses a tab by that key and cannot rewrite it. A plugin wanting a different identity opens a different tab.

7. **A tab that is gone makes the update a silent no-op.** A closed tab, an unknown instance key, or a plugin already disabled produces nothing — no throw, no note, no state emit — which is how `note` and `openOrFocusTab` already behave when their origin tab has disappeared (`src/plugins/context.ts:57-66`, the `isEnabled()` and origin-label guards).

8. **An invalid payload disables the plugin.** A result failing the plugin's own `isPayload` guard or `isJsonCompatible`, or an empty returned title, throws — crossing the failure boundary exactly as an invalid payload at creation does (`src/plugins/context.ts:74-77`). The existing rule stands: producing a value the plugin's own contract rejects means the plugin is broken, not that a caller got something wrong.

9. **`fixture-v1` stays frozen.** The frozen fixture declares four capabilities today (`src/plugins/fixture-v1/manifest.ts:15`) and is the definition of v1 compatibility, not a demonstration of every capability. It must keep passing `src/plugins/fixture-v1/compatibility.test.ts` unchanged — that unchanged pass is the evidence this addition is additive. New behavior is exercised by declarations built inside the tests that need them, the way `src/plugins/grouping.test.ts` and `src/plugins/teardown.test.ts` already construct a host from a test-local manifest and loader map.

10. **No wire or client change.** A plugin tab's envelope already rides inside the tab view on every state broadcast (`src/tab/view.ts:67-71`, the `plugin` field), and the client re-checks the payload against the plugin's own guard on every render (`web/src/plugins/registry.tsx:47-51`, `ValidatedPlugin`). Writing the tab and emitting `state: dirty` is the whole delivery path.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| Building the capability object; holding a plugin to its declared set | `src/plugins/context.ts:47` `createPluginContext`, `src/plugins/context.ts:32` `restrictToDeclared` |
| Validating a produced value: nonempty title, plugin guard, JSON compatibility | `src/plugins/context.ts:72-78` (the `openOrFocusTab` factory wrapper), `src/plugins/context.ts:14` `isJsonCompatible` |
| Finding a plugin tab by id plus instance key, then emitting state | `src/tab/openers.ts:33-40` (the existing-tab branch of `openPluginTab`) |
| Exposing a tab operation to the capability layer without reaching into tab internals | `src/tab/opening-state.ts:19` `openPluginTab`, reached as `managers.tab.openPluginTab` |
| Guarded invocation, per-call budget, rejection vs failure classification | `src/plugins/invoke.ts` `invokePlugin`, `src/plugins/host.ts` `runGuarded`/`invoke` |
| Disabling a plugin, recording the reason, closing the tabs it owns | `src/plugins/failure.ts`, `src/plugins/teardown.ts` `closePluginTabs` |
| Capability names as data, so an undeclared name is a compile error | `src/plugins/api.ts:5` `TabPluginCapabilityName`, `src/plugins/api.ts:18` the `CAPABILITIES` record |
| Delivering a changed payload to a mounted view without remounting it | `src/tab/view.ts` (plugin envelope), `web/src/plugins/PluginBody.tsx`, `web/src/plugins/PluginTabLayer.tsx` |
| A tab whose title and payload already change together in place | `src/tab/navigate.ts:9` `navigatePageTab` |
| Building a host from a test-local manifest and loader map | `src/plugins/grouping.test.ts`, `src/plugins/teardown.test.ts` |

## Proposed changes

**The contract (`src/plugins/api.ts`).** Add `updateTab` to `TabPluginCapabilityName` and to the `CAPABILITIES` record — the record is keyed by the union precisely so adding one without the other fails to compile. Add the matching member to `TabPluginServerCapabilities`, taking an instance key and a factory returning the new tab value. Introduce a result type for that factory carrying a required payload and an optional title, deliberately distinct from `TabPluginPayload`, whose title is required and whose factory receives the `TabPluginResources` this one does not. `TAB_PLUGIN_API_VERSION` is unchanged, and the file is 121 lines, comfortably inside the 200-line limit.

**The capability (`src/plugins/context.ts`, 95 lines).** Implement `updateTab` beside `openOrFocusTab`, keeping the same shape: return early unless `isEnabled()`, then delegate to the tab manager, wrapping the plugin's factory so the payload is checked against `activation.isPayload` and `isJsonCompatible` and a supplied title is checked for emptiness before anything is written. The two factory wrappers now share their validation; extract that shared check into a small named helper in the same module rather than duplicating it, which also keeps the file short. Unlike `openOrFocusTab`, this capability does not require the originating tab to still exist — the update targets the plugin's own tab, not the transcript that asked for it.

**The tab-side write (`src/tab/openers.ts` 106 lines, `src/tab/opening-state.ts` 48 lines).** Add an update operation beside `openPluginTab` that finds the tab whose plugin id and instance key both match, returns without side effects when there is none, and otherwise runs the factory, replaces `payload` on the plugin record, replaces `title` when the factory returned one, and emits `messageBus.emit('state', { type: 'dirty' })`. It must not move focus, reorder tabs, or touch `fileRefs`, `sourceLabel`, `instanceKey`, or `schemaVersion`. `TabOpeningState` exposes it exactly as it exposes `openPluginTab`, so the capability reaches tabs only through the manager.

**Documentation, which a test already enforces.** `src/plugins/documentation.test.ts` pins three facts against `TAB_PLUGIN_CAPABILITY_NAMES`, and all three fail until the docs move with the code: `documentation/developer-documentation/tab-plugins.md` must contain the sentence `The host supplies eight capabilities:` (the count word comes from that test's `COUNT_WORDS` table), a bullet beginning `` - `updateTab( ``, and a changelog sentence reading `eight server and five client capabilities.` The same file's fixture manifest block is pinned against `fixtureV1Manifest.capabilities`, so it must stay as it is — decision 9 keeps the fixture unchanged, which keeps that assertion satisfied. `ai/guidelines/plugins-tabs.md` states the server capability object has "exactly seven functions" and needs the same correction plus the new entry's rules. `product/specs/tab-plugins.md` gains a short subsection: a plugin may replace what one of its tabs shows, the tab keeps its place, identity, and focus when that happens, a stale target is ignored, and a plugin that produces an invalid replacement is disabled like any other broken plugin.

**Ordering.** The contract change lands first (it is what makes the capability nameable), then the tab operation, then the capability that calls it, then the documents. Typecheck stays green at each of those points; the documentation test goes red the moment `TAB_PLUGIN_CAPABILITY_NAMES` grows and green again when the three strings above are in place, so the doc edit belongs in the same change rather than a follow-up.

## Tests

Server, colocated as `src/plugins/*.test.ts`, following `context.test.ts` and `host.test.ts` and building any new plugin declaration test-locally per decision 9:

- A plugin calling `updateTab` from an intent replaces the payload the next tab view carries, and leaves the tab's label, position, group, focus, instance key, schema version, source label, and file references untouched.
- A factory returning a title changes the tab's strip title, including over a title a user had renamed; one returning no title leaves the existing title in place.
- An update naming an instance key with no open tab, and an update from a plugin already disabled, are both no-ops: no state emit, no note, no failure, plugin still enabled.
- An update naming an instance key owned by a *different* plugin does nothing, so one plugin cannot write another's tab.
- A payload failing the plugin's own guard, a payload that is not JSON-compatible, and an empty returned title each disable the plugin with the recorded reason and close the tabs it owns.
- A plugin whose manifest omits `updateTab` and calls it anyway is disabled for using an undeclared capability.
- An update issued from an opener applies, so the capability is not intent-only. One non-intent handler is enough: `createPluginContext` builds the same object for every guarded call and branches on nothing about the handler kind.
- `src/plugins/fixture-v1/compatibility.test.ts` passes unchanged — the additive-change proof.
- `src/plugins/documentation.test.ts` passes with the new count, which it derives from `TAB_PLUGIN_CAPABILITY_NAMES` rather than a literal.

Client, colocated as `web/src/plugins/*.test.tsx`:

- A mounted plugin body re-renders with a payload that changed on a state broadcast without remounting the plugin's chunk — the property that keeps video playback and scroll position alive across an update. This is the only new client test: a payload failing the entry's guard is already covered at `web/src/plugins/PluginTabLayer.test.tsx:158-166`, which asserts the `pluginFailed` report carrying `'invalid plugin payload'`, and that path is unchanged here.

## Out of scope

- **Updates from a plugin's own background work** — a watcher, timer, or subscription pushing with no user request in flight. That is a second mechanism, not a wider version of this one.
- **Registering new files to serve during a tab's life**, and any change to how file references are tracked or released.
- **Changing a tab's instance key, schema version, plugin id, focus, position, or group** through an update.
- **Queueing an update for a tab that might reopen later.**
- **Extending or re-freezing `fixture-v1`**, and any change to `TAB_PLUGIN_API_VERSION`, the client capability object, or the wire protocol.
- **The two blocked migrations themselves** — the embedded browser tab and the scheduling tab each keep their own backlog issue and their own plan. This plan only removes the contract obstacle in front of the first of them.

## Open questions

- The scheduling-tab migration needs a plugin tab to redraw when server-side state changes with no request in flight, which this request-driven capability does not provide. Whether that arrives as a host-to-plugin notification hook, an update handle with a revocation rule, or a host-owned subscription is a separate design decision, and that migration stays blocked until it is made.

## Verification

Run `./scripts/run.mjs check-diff`; it must be clean, including `src/plugins/documentation.test.ts` and the frozen `src/plugins/fixture-v1/compatibility.test.ts`.

Manual check: open a video tab with `open <video>`, and from a scratch build in which the video plugin's intent handler calls `updateTab` with changed metadata, confirm the header shows the new values while playback continues uninterrupted and the tab keeps its position in the strip. Rename that tab first to confirm a returned title replaces the alias and an absent one preserves it. Then close the tab, issue the same update again, and confirm the app keeps running with the plugin still reported as active by the `plugins` command (`src/commands/plugins.ts`).
