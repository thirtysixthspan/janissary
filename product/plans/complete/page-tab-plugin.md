# Move the embedded browser tab into a page plugin

**Complexity: 8/10** — the largest of the tab migrations. The schedules migration deliberately left this one behind ("needs a claim kind this plan does not add"), and that claim kind is the first of four additive v1 contract extensions this plan adds. The page tab is the only view tab reached by a *web address* rather than a file, the only one that writes host state read by a subsystem it knows nothing about (the monitor's page-text feed), the only one whose identity moves while it is open (navigation), and the only one carrying its own close affordance and a browser-level close workaround. Each of those is one extension. All four are additive, so `TAB_PLUGIN_API_VERSION` stays at 1, `fixture-v1` stays frozen, and every existing plugin keeps loading untouched.

## Goal

`open <url>`, `open page <address>`, and `open external <url>` reach a bundled `page` tab plugin instead of a core web opener and a core `view: 'page'` tab. Everything the user sees stays the same: the same two ways to name a web address, the same rejection of non-http schemes, the same root-domain tab name, the same metadata header with its address, back/forward/reload, split and close controls, the same double-click-to-edit address, the same live address following in-page navigation, the same monitor page-text feed, and the same profile capture and relaunch. Core stops carrying a `page` view kind, a `PageView` wire type, a page tab creator, a web opener, an `openPageTab` opener capability, page numbering, and two page-only wire methods.

## Design decisions

1. **A web-target claim kind, `webTargets`.** Every plugin contribution today is claimed by file extension or by command name; a web address is neither. `webTargets: true` on a declaration claims the `open` command's web branch — the targets `parseOpen` already flags with `web: true`, meaning an explicit `http`/`https` scheme or the `page` keyword. Resolution is first-claim-wins with the same rejection shape the extension and command claims use (`rejectContribution`), so a second claimant contributes nothing and starts disabled rather than throwing at module load. The host decides *what looks like* a web target; the plugin decides what a web target *means*, which is why nothing about the claim carries normalization.

2. **`snapshotTab(instanceKey, text)` is how a plugin tab feeds a monitor.** A monitor watching a page tab today reads `tab.pageSnapshot`, a server-only visible-text cache written by the `pageSync` RPC. The cache has to survive, because the monitor's whole page-text feature depends on it, and it cannot become client state — the flush that reads it is synchronous. So the client relays through an intent and the plugin writes the cache through one new capability, addressed by instance key exactly as `updateTab` and `dockTab` are, so a plugin can only ever write its own tab's snapshot. The feed stops asking whether a tab is a page view and asks only whether it has a snapshot, which is what makes the capability general rather than a hole cut for one plugin.

3. **An update may re-key the tab, and only a re-key moves an instance key.** A page tab's identity *is* its address: `open <url>` on an open address should focus that tab, and `profile save` must capture where the tab is now, not where it started. Both break if the key is frozen at the opening address while the view navigates. `TabPluginTabUpdate` gains an optional `instanceKey`, applied only by `updateTab` and refused when another open tab of the same plugin already holds it (the payload still applies, so a plugin never has to handle a partial update). Served files stay with the tab; an update still registers none. This is a widening of what an update may change, so it is additive.

4. **One new client capability, `close()`.** The metadata header's close button is spec'd as one of the five ways to close a page tab, and the cross-origin iframe needs the `beforeunload` fallback that today lives in core's `useCmdW` behind an `activeView === 'page'` test — a core special case for one view kind, which is exactly what this migration exists to remove. `close()` closes the tab the calling plugin body is mounted in, so the plugin owns both its button and its own workaround, and core's Cmd+W hook loses the special case and its `activeViewRef` parameter entirely. It is a callback rather than a host-rendered node like `splitAction` because the fallback needs to *call* it, not render it.

5. **Normalization stays in core, and the plugin imports it as a documented pure host module.** `normalizeWebUrl` and `rootDomain` are pure functions with two callers that cannot be collapsed: the plugin (opening and navigating) and core's profile relaunch (matching an authored entry against the tab it opens). Duplicating them would be the type-drift anti-pattern with a security-relevant predicate — scheme rejection — on both sides. `src/openers/page.ts` therefore loses `webOpener` and is renamed `src/openers/web-target.ts`, becoming the second documented pure host utility a server plugin may import, beside `openers/size.js`, with the lint allowance extended to name it.

6. **The payload carries the address and its label, and nothing else.** `PagePayload` is `{ url, domain }`. `number` disappears with the page-number scheme (decision 7), and the snapshot was never client state.

7. **Page numbers go away; a page tab is addressed by its label like every other plugin tab.** The host allocates plugin tab labels from `tabLabelPrefix`, giving `page`, `page-2`, `page-3`, and reusing a freed name exactly the way page numbers were reused — so the numbering property survives, but `page-1` becomes `page`. `close page <n>` cannot survive that without core resolving a label it invented for one plugin, so the form is removed: `close page`, `close page-2`, and tab-completion against labels replace it, alongside the four other unchanged ways to close. This is the one deliberate user-visible change, and it is the same trade the schedules migration made for its docked chrome row.

8. **Opening an address that is already open focuses that tab.** `openOrFocusTab` keyed on the normalized address gives that for free, and it is what every other plugin tab already does for its file. Today a second `open <url>` opens a second tab on the same page. The new behavior is the consistent one.

9. **Two wire methods go away.** `navigatePage` and `pageSync` exist only to serve this tab body; their work moves behind the `navigate` and `sync` intents, so leaving them would be a second execution path into the same host state. `PageView` leaves `src/protocol.ts` and `TabView.page` with them.

10. **`sync` carries the live address as well as the text.** The extension's content script posts one message holding both, so splitting it into two intents would double the round trips on the one path that fires per page change. The handler applies the re-key first and snapshots under the resulting key.

11. **The address field is the plugin's own.** `InlineEditInput` has three core callers and stays in core; the plugin gets a small `PageAddressInput` of its own rather than an import across the boundary or a host widget widened for a plugin. The three navigation icons come straight from `@fortawesome/free-solid-svg-icons`, the way `VideoTab` takes `faCamera`.

12. **A profile entry for a web plugin tab writes its address as `path`.** `writePluginEntry` already writes `path` for a plugin that claims extensions and omits it for one reached by a command; a web-claiming plugin is the third case, writing the instance key verbatim (an address is not a path and must not be run through `portablePath`). Relaunch reissues `open page <address>` — the keyword form, so a hand-authored bare address routes to the web branch instead of being read as a file — and matches on the normalized address, which is what the existing `page` entry already does. A legacy `type: "page"` entry loads as a `plugin` entry with id `page`, the same shim `image`, `markdown`, and `schedules` already get.

13. **`fixture-v1` stays frozen.** The new claim kind, capability, update field, and client capability are exercised by declarations built inside the tests that need them; `fixture-v1/compatibility.test.ts` passing unchanged is the proof this is additive.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| Recognizing a web target (`http`/`https` scheme, `page` keyword) | `src/commands/open.ts` `parseOpen` |
| URL normalization, scheme rejection, root domain | `src/openers/page.ts` → renamed `web-target.ts` |
| Refusing a duplicate contribution claim without throwing | `src/plugins/rejections.ts`, `opener-adapter.ts`, `command-adapter.ts` |
| Running a plugin opener from the `open` pipeline | `OpenContext.runPluginOpener` → `TabPluginHost.runOpener` |
| Replacing a live tab's payload and title | `src/plugins/context.ts` `updateTab`, `src/tab/openers.ts` `updatePluginTab` |
| Visible-text diffing, byte caps, per-monitor last-seen | `src/monitor/feed-diff.ts`, `src/monitor/page-feed.ts` |
| Holding a plugin to its declared capabilities | `src/plugins/context.ts` `restrictToDeclared` |
| Server and client plugin reference implementations | `src/plugins/video/`, `web/src/plugins/schedules/` |
| The legacy-tab-type profile shim shape | `src/profile/file.ts` |

## Implementation steps

### 1 — Contract additions

- `src/plugins/api.ts`: add `webTargets?: boolean` to `TabPluginDeclaration`; add `snapshotTab` to `TabPluginCapabilityName`, `CAPABILITIES`, and `TabPluginServerCapabilities`; add optional `instanceKey` to `TabPluginTabUpdate`. `TAB_PLUGIN_API_VERSION` is unchanged.
- `src/plugins/context.ts`: implement `snapshotTab`, resolving the plugin's own tab by id plus instance key and writing `pageSnapshot`; a key with no open tab is a no-op.
- `src/tab/openers.ts`: `updatePluginTab` applies `update.instanceKey` when one is returned and no other tab of the same plugin holds it.
- `src/plugins/web-adapter.ts` (new): `resolveWebClaim(declarations)` returns the id of the first declaration claiming `webTargets`, recording a duplicate-claim rejection for any later one. Exported from `src/openers/index.ts` beside `pluginOpeners` so the `open` dispatcher has one place to ask.
- `src/open-file-command.ts`: the web branch routes to the claiming plugin's opener through `context.runPluginOpener`, keeping the pinned-command refusal ahead of it and reporting `open: no viewer for web addresses` when nothing claims the kind.
- `src/openers/types.ts`: drop `openPageTab` from `OpenContext`.
- `web/src/plugins/api.ts`, `PluginBody.tsx`, `PluginTabLayer.tsx`, `DockedPluginBody.tsx`, `MountedViewLayers.tsx`: add `close` to `TabPluginClientCapabilities` and thread the existing `closeTab(index)` through.

### 2 — Server plugin

- `src/plugins/page/shared.ts`: `PAGE_PAYLOAD_SCHEMA_VERSION = 1`, `PagePayload`, and hand-written import-free guards `isPagePayload`, `isNavigateIntent`, `isSyncIntent`.
- `src/plugins/page/manifest.ts`: id `page`, version `1.0.0`, `tabLabelPrefix: 'page'`, `fileExtensions: {}`, `webTargets: true`, capabilities `note`, `openOrFocusTab`, `updateTab`, `snapshotTab`, `openExternally`, `rejectRequest`, `reportFailure`.
- `src/plugins/page/activate.ts`: `opener.inline` normalizes the target, notes `open: invalid URL "<target>"` on rejection, and otherwise opens or focuses the tab keyed on the normalized address with `{ title: domain, payload: { url, domain } }`; `opener.external` normalizes, hands the address to `openExternally`, and notes the same two messages as today. `intent` answers `navigate` (validate, re-key, retitle, replace payload; an invalid address is answered as a rejection and leaves the tab where it is) and `sync` (re-key first when the live address moved, then `snapshotTab`), reporting a failure for a tab payload that is not one of ours and rejecting an unknown intent name.
- Register in `src/plugins/catalog.ts` and `src/plugins/loaders.ts`; extend the lint allowance in `eslint.plugin-boundaries.mjs` to `openers/web-target.js`.

### 3 — Client plugin

- `web/src/plugins/page/`: `index.tsx` (default export plus `isPayload`), `PageTab.tsx` moved from `web/src/`, `PageAddressInput.tsx`, and `usePageContentSync.ts` moved from `web/src/page/`.
- The component takes `{ payload, capabilities }`: address and label from the payload, split from `capabilities.splitAction`, close from `capabilities.close`, and navigation and content relay through `capabilities.intent`. The iframe keeps its reload nonce and is keyed on the address as well, so a navigation still remounts it exactly as the core key did. The `beforeunload` fallback moves here, gated on `capabilities.active`. No `client`, no `index`, no `closeTab` prop.
- `web/src/plugins/registry.tsx`: add the `page` loader and registration with its schema-version literal.

### 4 — Remove the core page tab

- Delete `src/page/sync.ts`, `web/src/PageTab.tsx`, `web/src/page/`, and their tests, after porting the cases listed under Tests. Rename `src/openers/page.ts` → `src/openers/web-target.ts` (and its test), keeping only `normalizeWebUrl` and `rootDomain`.
- Drop `makePageTab` (`src/tab/index.ts`), `addPageTab` and `uniquePageNumber` (`src/tab/creators.ts`, `src/tab/unique-labels.ts`), `openPageTab` (`src/tab/openers.ts`, `src/tab/opening-state.ts`, `src/open-file-manager.ts`), `navigatePageTab` (`src/tab/navigate.ts`), `navigatePage` (`src/tab/operations.ts`, `src/tab/manager.ts`, `src/controller/tab-adapter.ts`, `src/controller.ts`), and `'page'` from the view unions in `src/tab/types.ts` and `src/protocol.ts`.
- Drop `PageView` and `TabView.page` from `src/protocol.ts`, `src/tab/types.ts`, and `src/tab/view.ts`; `Tab.pageSnapshot` stays, now written by the capability.
- Drop `navigatePage` and `pageSync` from `src/protocol.ts`, `src/client-message.ts`, `src/message-handler.ts`, `src/controller.ts`, and `web/src/ws.ts`.
- `src/monitor/page-feed.ts`: select any tab carrying a `pageSnapshot`, labelling the diff with the tab's title.
- `src/commands/close.ts`: drop the `page` target form.
- Client: drop the page branch in `web/src/MountedViewLayers.tsx`, `'page'` from `web/src/useViewSearchState.ts` and `web/src/AppCenterActionArea.tsx`, and the `activeViewRef` parameter and `beforeunload` block from `web/src/useCmdW.ts`.

### 5 — Profiles

- `src/profile/save-entries.ts`: `writePluginEntry` writes the instance key verbatim for a web-claiming declaration; `writePageEntry` is deleted.
- `src/profile/view-tabs.ts`: a `plugin` entry whose declaration claims web targets relaunches with `open page <address>` and matches on the normalized address; the `page` case is deleted.
- `src/profile/save-route.ts`: drop the `page` case and the `pages` counter — a page tab is now counted as a plugin tab.
- `src/profile/types.ts`: delete `ProfilePageTabFile` and the `page` member of `ProfileViewEntry`.
- `src/profile/file.ts`: `page` partitions into `views` as `{ type: 'plugin', id: 'page', path: url }`.
- `src/profile/schema.ts`: `page` stays a recognized on-disk type, validated as before.

## Tests

Contract (`src/plugins/context.test.ts`, `src/plugins/update-tab.test.ts`, `src/plugins/adapters.test.ts`, built from test-local declarations):

- `snapshotTab` writes the snapshot for the plugin's own tab, no-ops for an unknown instance key, cannot write another plugin's tab, and disables the plugin when undeclared.
- An update re-keys the tab, leaves the key alone when another tab of the same plugin holds it while still applying the payload, and leaves label, group, position, and served files untouched either way.
- A second declaration claiming `webTargets` is rejected with a duplicate-claim reason and contributes nothing.
- `src/plugins/fixture-v1/compatibility.test.ts` and `src/plugins/documentation.test.ts` pass, the latter with the new counts.

Open pipeline (`src/open-file-manager.test.ts`, `src/openers/web-target.test.ts`):

- `open <url>` and `open page <address>` route to the claiming plugin's inline opener with the target verbatim; `open external <url>` routes to its external opener; a pinned plugin command still refuses a web target; the existing normalization cases keep passing under the renamed module.

Server plugin (`src/plugins/page/activate.test.ts`, modeled on `video/activate.test.ts`):

- Opening an address opens a tab titled with its root domain and carrying the normalized address; a second open of the same address focuses it rather than opening a second; an unviewable scheme and a malformed address are noted, not opened.
- The external presentation opens the OS browser and notes the domain, and notes the address when no browser is available.
- `navigate` re-keys, retitles, and replaces the payload; an invalid address is rejected and leaves the tab unchanged.
- `sync` snapshots the text, and re-keys when the live address moved; a foreign tab payload reports a failure; an unknown intent is rejected.
- `isPagePayload` accepts a complete payload and rejects `null`, an array, and each missing field.

Monitor (`src/monitor/page-feed.test.ts`): a plugin tab with a snapshot is fed and diffed as before; a plugin tab without one contributes nothing.

Profiles:

- A page plugin tab saves as a `plugin` entry with its address as `path` and no presentation change; a file-opened plugin tab still saves a portable path; a command-opened one still omits `path`.
- A `plugin` entry for a web-claiming plugin relaunches by reissuing `open page <address>`, matching a bare authored address to the tab it opens; a legacy `type: "page"` entry does the same.

Client (`web/src/plugins/page/PageTab.test.tsx`, ported from the existing suite):

- The header renders the address, the navigation buttons act on the iframe, double-click edits and Enter sends the `navigate` intent while Escape sends nothing, and the close button calls `capabilities.close`.
- A content-relay message from the tab's own iframe sends the `sync` intent; a message from another window is ignored.
- `web/src/plugins/registry.test.tsx`: the page schema-version literal matches the plugin's own constant.
- `web/src/plugins/PluginTabLayer.test.tsx`: the capability object's `close` closes that tab.

## Out of scope

- Any change to how the embedded page looks or behaves beyond what the migration forces, other than the two accepted changes: `close page <n>` becoming label-addressed, and a repeat `open` of an already-open address focusing it.
- The framing-header relaxation in the managed browser, the bundled extension's content script, and the `browser` command's Playwright windows — none of which the page *tab* owns.
- Further claim kinds, and any topic, notification, or docking for this plugin.
- Restoring page tabs on `--relaunch`; profiles keep the capture and relaunch they already have.
