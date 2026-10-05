# Host-state fingerprint on the plugin tab

**Complexity: 2/10** — one module's private memory moves from a module-level map onto the tab's existing runtime sub-record; delivery behavior does not change.

## Goal

Keep the record of what host state was last pushed to a plugin tab on that tab, instead of in `lastPushed`, a module-level `WeakMap<PluginRecord, Map<instanceKey, fingerprint>>` in `src/plugins/host-state.ts` that a manual sweep prunes. Architecture principle 2 and the plugin guidelines rule out a parallel per-tab map, and a tab closed on a path the sweep does not see could leave a stale fingerprint behind.

## Approach

`TabRuntime` in `src/tab/types.ts` already carries per-tab state owned by other modules (`idleEscalation`, owned by `src/harness/idle-notification.ts`). Add an optional `hostStatePushed` string there, owned by `src/plugins/host-state.ts`, and read and write it through `tabRuntime(tab)` from `src/tab/runtime.ts`.

The memory now lives and dies with the tab. Every path that rebuilds a tab (`removeTabAt`, renumbering, `updatePluginTab`) copies it shallowly or mutates it in place, so the same `runtime` object rides along, and a newly opened tab starts with none. That covers both cases the old map handled by hand: a tab taking a label a closed tab held is a new tab object, and so is a tab reopened under an instance key a closed tab used.

The fingerprint now includes the instance key alongside the two slices. The old map was keyed by instance key, so a tab whose key `updateTab` changed was delivered again under its new key. Folding the key into the fingerprint keeps that.

Writing the fingerprint before the delivery still matters: a handler's `updateTab` emits `state: dirty` synchronously, and the re-entrant pass must see the tab as already pushed. Storing on the tab satisfies that without the "publish the map before the loop" step.

Rejected: storing it on `PluginTabRecord` (`tab.plugin`). `updatePluginTab` replaces that record with a spread on every update, so it would survive, but the record is the plugin's ownership data and the runtime sub-record is where per-tab host bookkeeping already lives, as the backlog proposal asked.

## Implementation steps

1. Add `hostStatePushed?: string` to `TabRuntime` in `src/tab/types.ts` with a one-line ownership comment matching `idleEscalation`'s.
2. In `src/plugins/host-state.ts`, delete `lastPushed`, the publish-before-loop step, the `open` set, and the pruning sweep. Read and write `tabRuntime(tab).hostStatePushed`, and include the instance key in `fingerprint`. Rewrite the comments that described the map to describe the per-tab record.
3. Update the "Being told when host state changes" paragraph in `product/specs/tab-plugins.md` to say a tab whose instance key changes is delivered again and that a tab's delivery memory ends with the tab.

## Tests

The existing cases in `src/plugins/host-state.test.ts` (delivers once, re-entrant handler, changed rows, reused label, reused instance key) must pass unchanged. Add:

- A tab whose instance key changes is delivered again under the new key even when its rows are unchanged.
- The fingerprint is recorded on the tab's runtime sub-record, so a tab object carried into a rebuilt list (as `removeTabAt` does with a spread) is not delivered again.

## Out of scope

- Changing what a delivery carries or when the `state` signal fires.
- Moving other managers' label-keyed maps onto the tab.
- User or developer documentation: neither describes where the memory is kept.
