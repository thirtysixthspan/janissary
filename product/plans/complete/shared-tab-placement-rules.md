# Share the server's tab-placement rules with the web client through one module

**Complexity: 5/10** — no new architecture: four small predicates and one new one move into a dependency-free module, and about a dozen importers on both sides switch to it. The fan-out is mechanical but crosses the server/client boundary through the `@shared` alias, and one client quit check changes behavior slightly to match what the server already does.

The server decides which tabs sit in the center strip, which pane they occupy, and which can split in `src/tab/split.ts`, and decides when a close quits the app in `src/tab/close.ts`. The client re-derives each rule inline: `paneOf` in `web/src/center-panes.ts`, `!isReportingTab(tab) && !tab.dock` in `web/src/useTabEntries.ts` and `web/src/pickers/tab-nav-match.ts`, the notifications check before `onSplit` in `web/src/AppCenterActionArea.tsx`, and `tabs.filter((t) => !t.dock).length === 1` in `web/src/App.tsx` and `web/src/agent-tabs/command-input/useCommandBarSubmit.ts`. Architecture principle 1 says the client should not compute state the server also computes.

The two client quit checks have already drifted from the server's rule. The server quits only when the tab being closed is itself non-docked and is the last one. The client checks only the count, so closing a sidebar-docked tab while one center tab remains opens the quit dialog, although the server would just close the docked tab.

## Goal

One module, `src/tab/placement.ts`, defines `centerPane`, `isReportingTab`, `isCenterActionTab`, `isSplitEligibleTab`, and `closeQuitsApp(tabs, index)`, typed over `Pick<TabView, 'dock' | 'view' | 'pane'>` so both the server `Tab` and the wire `TabView` satisfy it. The server and client both import it, and no client file keeps its own copy of these rules.

## Approach

1. **`src/tab/placement.ts`** (new, type imports only, so the client bundle can load it): 
   - `centerPane(tab)` → `tab.pane ?? 'left'`
   - `isReportingTab(tab)` → `tab.view === 'monitor'` (moved from `web/src/tab-entries.ts`)
   - `isCenterActionTab(tab)` → `!tab.dock && !isReportingTab(tab)`
   - `isSplitEligibleTab(tab)` → `isCenterActionTab(tab) && tab.view !== 'notifications'`
   - `closeQuitsApp(tabs, index)` → the tab at `index` exists, is not docked, and is the only non-docked tab. This takes the index because the server's rule depends on which tab is closing, not just the count.
2. **Server**: `src/tab/split.ts` drops its three predicates and imports them from `placement.js`. Every other server importer (`place-profile-tabs.ts`, `reorder.ts`, `split-selection.ts`, `operations.ts`, `navigation-commands.ts`, `open-result.ts`, `src/profile/save-entries.ts`, and `split.test.ts`) imports from `placement.js` directly. No re-exports, per the barrel-file guideline. `src/tab/close.ts` replaces `!tab.dock && nonDockedCount <= 1` with `closeQuitsApp(tabs, index)` and keeps `nonDockedCount` for `closeTabResources`.
3. **Client**:
   - `web/src/center-panes.ts`: delete `paneOf` and call `centerPane`.
   - `web/src/tab-entries.ts`: drop `isReportingTab`. `useSectionNav.ts` and the reporting filter in `useTabEntries.ts` import it from `@shared/tab/placement`.
   - `useTabEntries.ts` action filter and `pickers/tab-nav-match.ts`: use `isCenterActionTab`.
   - `AppCenterActionArea.tsx`: `onSplit={isSplitEligibleTab(tab) ? onSplit : undefined}`.
   - `App.tsx` `closeTab(index)`: use `closeQuitsApp(tabs, index)`.
   - `useCommandBarSubmit.ts` (`close`/`exit` on the active tab): use `closeQuitsApp(tabs, activeTab)`.
4. **Alias**: `@shared` maps to `src/` in `web/tsconfig.json`, `web/vite.config.ts`, and the client project in `vitest.config.ts`. `src/tab/placement.ts` is a runtime import like `src/search-matches.ts`, which already resolves through all three, so no alias edit is needed. The client tests exercising the module confirm the vitest side, and the web typecheck confirms the tsconfig side.

## Implementation steps

1. Create `src/tab/placement.ts` and `src/tab/placement.test.ts`. Switch the server importers and `close.ts`. Run `check-diff`.
2. Switch the client files and move `web/src/tab-entries.test.ts`'s `isReportingTab` cases into `src/tab/placement.test.ts` (delete the web test file, since `tab-entries.ts` becomes type-only). Run `check-diff`.
3. Run the full web test suite once (`npx vitest run --project client`), because several client consumers have no tests of their own and `check-diff` scopes to related tests.

## Tests

- `src/tab/placement.test.ts`: `centerPane` defaults to left and honors right; `isReportingTab` is true only for monitor; `isCenterActionTab` excludes docked and monitor tabs; `isSplitEligibleTab` also excludes notifications; `closeQuitsApp` is true for the last non-docked tab, false while another non-docked tab remains, false for a docked tab even when one non-docked tab remains, and false for an out-of-range index.
- `src/tab/split.test.ts` keeps passing unchanged apart from its import.

## Spec

`product/specs/tabs.md`: closing a sidebar-docked tab never quits the app and never opens the quit confirmation, even when only one non-docked tab remains.

## Out of scope

- `allowedRange` in `web/src/useTabReorder.ts`, which re-derives `computeReorderTo`'s group rule.
- The repeated `gridColumn: tab.pane === 'right' ? 2 : 1` in `MountedViewLayers.tsx`, `ShellTabLayer.tsx`, `harness/HarnessTabLayer.tsx`, and `plugins/PluginTabLayer.tsx`.
- Sending placement on the wire instead of computing it from raw tab fields on the client.
