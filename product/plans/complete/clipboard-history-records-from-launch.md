# Record clipboard copies from launch, not from the popup's first open

**Complexity: 4/10** — one optional declaration field, a startup pass in the overlay-plugin host with a guard for an activation that outlives a dispose, a live cap read in the clipboard store, and the docs that said the opposite.

## Goal

The pull request backlog reports that the clipboard history collects nothing until the popup is first opened. That is the design as shipped: the plugin's chunk loads on the first chord, `clip`, or right-click **Paste from clipboard…**, and only its `start` subscribes to the copy-capture seam, so every copy made before that first open is lost. A user who copies three things and then presses `Ctrl+Shift+V` sees an empty popup, which reads as a broken feature.

## Approach

A history has to observe copies from launch, so the clipboard plugin's activation trigger becomes "startup" rather than "first open". `ai/guidelines/plugins.md` §3 puts activation triggers in the static declaration and §6 asks a broad trigger to carry a comment justifying it, so:

- `OverlayPluginDeclaration` gains an optional `activation?: 'open' | 'startup'`, defaulting to `'open'`. It is additive, so the API version stays 1.
- The host gains `activateAtStartup()`, which activates every accepted declaration whose activation is `'startup'`. Activation keeps every existing guard: the timeout, the containment, and the disable-and-report path. The chunk is still a separate dynamic import, so the entry bundle stays free of plugin code.
- `useOverlayPlugins` calls it from an effect keyed on the host, so the side effect runs after mount rather than during render.
- The clipboard declaration sets `activation: 'startup'`, with the justification beside it.

Two consequences of activating at mount need handling:

1. **The cap arrives later.** The configured `clipboardHistoryMaxEntries` reaches the client in the first state snapshot, after mount. The capability already exposes `maxEntries` through a getter, but the host spreads the grants (`{ ...capabilities, close }`), which evaluates the getter once at activation and freezes the default. The host instead passes a capability object whose `maxEntries` getter reads the grants on every access. The clipboard store takes a cap *source* (`() => number`) rather than a number and reads it on every record and every open, so a cap that arrives after startup is applied to the next copy and to the next open, trimming what is already held when it is lower. The contract text changes from "read once, at `start`" to "read it when it is needed; the configuration may arrive after `start`".
2. **An activation can outlive a dispose.** Under `React.StrictMode` the hook's effects run, are cleaned up, and run again on the same memoized host. A startup activation from the first run is still loading when `dispose` runs, and without a guard it would call `start` after the dispose and race the second run's activation. The host keeps a generation counter that `dispose` advances; an attempt that finds the generation changed after its load does not start the plugin and reports false without disabling it.

## Implementation steps

1. `web/src/overlay-plugins/api.ts` — add `OverlayPluginActivation = 'open' | 'startup'` and the optional `activation` field on `OverlayPluginDeclaration`, documented; change the `maxEntries` capability comment to say it may change after `start`.
2. `web/src/overlay-plugins/registry.ts` — set `activation: 'startup'` on the clipboard-history declaration with a comment saying why.
3. `web/src/overlay-plugins/host.ts` — add `activateAtStartup()` to `OverlayPluginHost`; build the per-plugin capability object with a live `maxEntries` getter instead of a spread; add the generation guard to `activate` and advance it in `dispose`; update the header comment.
4. `web/src/useOverlayPlugins.ts` — add the effect that calls `host.activateAtStartup()`; update the header comment that said nothing activates a plugin.
5. `web/src/overlay-plugins/clipboard-history/store.ts` — replace the stored number with a cap source; `applyMaxEntries` and `startHistory` take `() => number`; `trim` reads the source; `selectNewest` trims first so an open applies a cap that arrived since the last copy; `disposeHistory` resets the source to the fallback.
6. `web/src/overlay-plugins/clipboard-history/index.tsx` — pass `() => capabilities.maxEntries` to `startHistory`; correct the comment about activation timing.

## Tests

- `web/src/overlay-plugins/host.test.ts`:
  - `activateAtStartup` loads and starts a `'startup'` plugin and registers its overlay without any opener being called.
  - `activateAtStartup` leaves an `'open'` plugin (and one with no `activation`) unloaded.
  - A startup plugin whose load throws is disabled and reported, like any other activation.
  - The capability's `maxEntries` reflects a grants getter whose value changes after `start`.
  - An activation still loading when the host is disposed does not call `start`.
- `web/src/overlay-plugins/clipboard-history/store.test.ts`:
  - Existing cap tests move to the cap-source signature.
  - A cap source whose value rises after start keeps more entries on later copies; one that falls trims on the next open.
  - The start/dispose capture test's comment no longer claims the history begins at first open.
- `web/src/useOverlayPlugins.test.tsx`: mounting the hook records a copy made before any open — `captureCopiedText` after mount shows up in the clipboard plugin's rows once the startup activation settles.
- `web/src/overlay-plugins/registry.test.ts`: the shipped clipboard declaration activates at startup, and the documented example shows it.

## Spec and docs

- `product/specs/clipboard-history.md` — "What is recorded": the history begins at launch; remove the sentence saying nothing is recorded until the first open. "Order, duplicates, and the cap": unchanged in substance.
- `documentation/developer-documentation/overlay-plugins.md` — add `activation` to the declaration example and the reference table; replace "Nothing about a plugin executes at startup" with the activation rule; update the `maxEntries` row; note the field in the v1 changelog as an additive optional field.
- `help.md` and `documentation/user-documentation/command-bar/clipboard.md` do not say when recording starts, so they need no change.

## Out of scope

- Buffering copies in the shared capture seam for a plugin that has not loaded yet. Startup activation is the declared-trigger mechanism the plugin guidelines name, and a buffer would put the history's cap and retention decisions back in shared code.
- Republishing claims after a StrictMode dispose. That is a separate, pre-existing dev-only lifecycle question.
- The `Cmd+Shift+V` chord, which is the next backlog entry.
