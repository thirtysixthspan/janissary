# Source the app's display limits from one server-seeded settings object

**Complexity: 6/10** — ~80 added lines, 12 edited production files, 7 requirements, 8 scenarios, 6 new units (p=5.96); the cross-component wiring and the two new modules dominate.

The tab-name and clipboard-history limits are authoritative in `.janissary/config.json` and arrive in the state snapshot, but the client re-declares them as `16`, `50` and `15` in `useServerState.ts`, as optional `= 16`/`= 50` prop defaults in four components, and as a hardcoded `tabNameMaxLength={50}` in `ReportingSection.tsx`. Reporting rows therefore shorten names at 50 while the configured inactive limit is 16, so the same tab reads differently in two surfaces.

## Goal

One shared constants module is the single source for `tabNameMaxLength`, `activeTabNameMaxLength` and `clipboardHistoryMaxEntries`. The client seeds its settings from that module, the server snapshot overwrites them, and one provider hands the values to every tab strip — including the reporting strip, which uses the configured inactive limit for all of its rows. No component carries a fallback literal for a setting the server owns.

## Approach

- Add `src/shared/config-defaults.ts` exporting `DEFAULT_TAB_NAME_MAX_LENGTH`, `DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH` and `DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES`. `src/config.ts` imports them for `DEFAULT_CONFIG` instead of declaring them, and `src/config.test.ts` imports them from the new leaf module. The new module holds only constants, so the client can import it for runtime values through the existing `@shared/*` alias — confirm the alias in `web/tsconfig.json`, `web/vite.config.ts` and the `client` project in `vitest.config.ts` (the latter already aliases `@shared` for `src/search-matches.ts`).
- In `web/src/useServerState.ts`, replace `useTabNameLimits` and `useClipboardHistoryCap` with one `useAppSettings()` returning `{ settings, setSettings }`, seeded from the shared constants. `setSettings` merges a `Partial` of the settings. `Setters` drops the three individual setting setters in favour of one `setSettings`, and the snapshot handler calls it once with all three values. Keep `setSettings` referentially stable so the state subscription does not re-run on every settings change.
- Add `web/src/AppSettings.tsx`: a React context holding the settings value, an `AppSettingsProvider` that publishes it, and a `useAppSettingsContext()` reader whose default is the shared constants (so a component rendered outside the provider still behaves correctly). The context carries the value only; state ownership stays in `useAppSettings()`.
- In `web/src/App.tsx`, call `useAppSettings()`, wrap the tree in `AppSettingsProvider` beside `PluginChordProvider`, pass `setSettings` to `useServerState`, read the clipboard cap from `settings`, and stop passing the two length props to `AppMain`. Remove those props from `AppMain.tsx` and the two fields from `CenterActionAreaProps.ts`.
- `Sidebar.tsx`, `CenterActionArea.tsx` and `ReportingSection.tsx` read the context and pass required numbers to `TabStrip.tsx`; `TabStrip.tsx` and `TabItem.tsx` take `activeTabNameMaxLength` as a required prop. `AppShell.tsx` stops threading the two lengths. `ReportingSection.tsx` passes the configured inactive length for both of its strip limits, replacing `tabNameMaxLength={50}`. Leaf components still receive the narrow numbers they render, not the settings object.

## Implementation steps

1. Add `src/shared/config-defaults.ts`; switch `src/config.ts` and `src/config.test.ts` to it.
2. Rewrite the settings hooks and `Setters` in `web/src/useServerState.ts`.
3. Add `web/src/AppSettings.tsx` with the context, provider and reader.
4. Wire the provider and `setSettings` into `web/src/App.tsx`; strip the length props from `AppMain.tsx`, `AppShell.tsx`, `CenterActionAreaProps.ts`, `AppCenterActionArea.tsx`, `Sidebar.tsx` and `CenterActionArea.tsx`.
5. Make `activeTabNameMaxLength` required in `TabStrip.tsx`/`TabItem.tsx`; have `ReportingSection.tsx` read the context and pass the inactive limit for both strip limits.
6. Run `check-diff` after each step.

## Tests

- `web/src/useServerState.test.ts`: assert the snapshot calls a single `setSettings` with the three values.
- `web/src/TabStrip.test.tsx`: pass the newly required `activeTabNameMaxLength` at every render site; keep the existing truncation cases.
- `web/src/ReportingSection.test.tsx`: render under `AppSettingsProvider` with a short configured inactive length and assert a long monitor name is shortened to that length with an ellipsis — the case that fails while the strip hardcodes 50.
- `web/src/Sidebar.test.tsx` and `web/src/App.test.tsx`: cover context-provided limits reaching a docked strip and the centre strip.
- `web/src/CenterActionArea.test.tsx`: drop the removed props.
- `src/config.test.ts`: keep the config default assertions importing from the new leaf module.

## Spec

`product/specs/tabs.md`, "Tab label length": state that every tab strip, including the reporting strip, uses the configured limits, and that reporting rows use the inactive limit.

## Out of scope

Changing which values the server sends, adding a runtime command to edit these settings, changing the 50-character rename input cap, and any change to how the server reads `.janissary/config.json`.
