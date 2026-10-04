# Key the host-state fingerprint by instance key

**Complexity: 3/10** — one map's key, one pruning pass, two tests.

**Goal.** `src/plugins/host-state.ts` keeps its `lastPushed` fingerprints in a map keyed by tab label and never removes an entry when that tab closes. A tab given the label a closed one held therefore computes the fingerprint already on file and is never delivered its rows at all: the second shell tab opened in a session draws a connections window with nothing in it and a button that says there are none, for the whole life of that tab. That is the "rows computed and drawn nowhere" state this channel exists to remove.

**Approach.** Key the memory by `tab.plugin.instanceKey` instead. The instance key is the one field on a plugin tab that is unique per invocation and stable for the tab's life — `nextInstanceKey` in `src/plugins/shell/activate.ts` mints a fresh one for every `zsh`, and `removeTabAt` in `src/tab/reorder.ts` preserves `plugin` across the fresh `Tab` object it builds for each survivor, which is what rules out a `WeakMap` keyed on the tab itself. The rows themselves are still read with the label, because that is what `connectionsFor` and `scheduleView` take; only the memory changes.

Pruning rides along in the same pass. Keyed per instance, an entry outlives the tab it described, so a session that opened a hundred shell tabs would carry a hundred fingerprints for the rest of its life — and, worse, a plugin that reuses an instance key it has used before would find the previous tab's fingerprint still on file and be silenced exactly as a reused label silenced it. A closed tab's memory goes with it.

The map is still published to the `WeakMap` before the loop rather than after, because the re-entrancy the existing comment describes is unchanged by any of this: a handler that merges rows with `updateTab` brings the whole chain back round, and an unpublished map is invisible to that pass.

## Implementation

1. In `src/plugins/host-state.ts`, key `pushed` by `tab.plugin.instanceKey` and collect the open keys in the loop, deleting any key no open tab holds once the loop is done.

## Tests

In `src/plugins/host-state.test.ts`, two cases the file did not have:

- deliver for `shell1`, take the tab away, add a new tab that also carries the label `shell1` with the same rows, fire again — the handler is called a second time, and with the new instance key. Fails against the label-keyed map.
- deliver for `shell1`, close it, reopen a tab carrying the *same* instance key, fire again — the handler is called a second time. Fails against the per-instance map without the pruning pass, so the memory-only concern turns out to have an observable consequence and is pinned by a test rather than asserted about.

The delivery-once, redelivery-on-change, re-entrancy and grant cases keep passing untouched, as does `src/plugins/shell/activate.test.ts`: the plugin's own payload still starts with empty rows and still receives its first delivery.

## Out of scope

- What a handler does with a slice once it has it. The channel's delivery is what was broken.
- Bounding the map by recency rather than by liveness. A live tab's entry is the point of the map, so there is nothing to shed short of the tab closing.