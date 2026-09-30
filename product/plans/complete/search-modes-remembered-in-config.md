# Remember the Search Toggles in the Config File

**Complexity: 5/10** — two additive capabilities in the v1 tab-plugin contract, a new `pluginSettings` key in `.janissary/config.json`, the search session seeding and saving its three modes through them, and the documentation the capability count is pinned against. No wire or client change.

## Goal

The search tab's three toggles (regular expression, match case, whole word) should be remembered in `.janissary/config.json`. Today they live only in the plugin's in-memory payload, so every restart brings back all three switched off, however the user last left them.

## Approach

A plugin cannot read or write the config itself: the plugin import boundary forbids a concrete server plugin from reaching `src/config.ts`, and the plugin guidelines say a plugin's reach is exactly its capability object. So the host grows two capabilities, following the `configuredViewer` precedent of a config section keyed by plugin id:

- `readSettings()` returns this plugin's own settings object, or `{}` when it has none.
- `saveSettings(settings)` replaces this plugin's own settings object and returns whether the write succeeded.

Both address only the calling plugin's id, so a plugin cannot read or overwrite another plugin's settings. The config grows one key, `pluginSettings`, a map from plugin id to a JSON object. It defaults to `{}`, and decoding drops any entry whose value is not an object without discarding its neighbours, like every other setting. `saveSettings` writes through `updateConfig`, so it inherits the atomic replace and the preservation of hand-added keys. A settings value that is not a plain JSON object is a plugin bug, so it throws an ordinary error across the failure boundary rather than being silently written. A revoked plugin reads `{}` and saves nothing, like the other side-effecting capabilities.

Both are additive optional capabilities, so the API integer stays 1 and the frozen `fixture-v1` is untouched.

The search session reads the saved modes once, when it is built, and seeds its first payload with them. Each value falls back to `false` independently when it is missing or not a boolean. Every search the client starts carries all three modes, so `run` compares them with what was last saved and calls `saveSettings` only when one has changed. The file is not rewritten on every keystroke. A failed save leaves the toggles working for the session and is not reported, since nothing the user can do in the tab would fix it. The client already seeds its toggle state from the payload it mounts with, so no client change is needed.

Rejected: a dedicated `searchModes` top-level config key read by a search-specific capability. It would put one plugin's name into the host contract, and the next plugin wanting a remembered preference would need another capability.

## Implementation steps

1. **Config.** In `src/config.ts`, add `pluginSettings: Record<string, Record<string, unknown>>` to `Config` with a comment, and `pluginSettings: {}` to `DEFAULT_CONFIG`. In `src/config-decode.ts`, decode it with a `settingsMap` helper that keeps only entries whose value is a record.
2. **Host helpers.** Add `src/plugins/settings.ts` with `readPluginSettings(id)` and `savePluginSettings(id, settings)` over `getConfig`/`updateConfig`, so `context.ts` stays delegation.
3. **Contract.** Add `readSettings` and `saveSettings` to `TabPluginCapabilityName` and the `CAPABILITIES` record in `src/plugins/api-capabilities.ts`, and to `TabPluginServerCapabilities` in `src/plugins/api.ts` with comments. Implement both in `createPluginContext` in `src/plugins/context.ts`.
4. **Search.** Declare both capabilities in `src/plugins/search/manifest.ts`. Add `src/plugins/search/saved-modes.ts` with a pure `modesFrom(settings)` and `sameModes(a, b)`. In `src/plugins/search/session.ts`, seed the payload's modes from `readSettings()` in the constructor, and save the request's modes in `run` when they differ from the last saved set.
5. **Developer documentation.** In `documentation/developer-documentation/tab-plugins.md`, raise the capability count to seventeen, add the two bullets, and extend the v1 changelog entry. `src/plugins/documentation.test.ts` pins the count, so its word list gains `sixteen` and `seventeen`.

## Tests

- `src/config.test.ts`: `pluginSettings` defaults to `{}` and is written on first launch; an existing file's entries are read, with a non-object entry dropped and its neighbours kept; `updateConfig({ pluginSettings })` survives a reload.
- `src/plugins/settings.test.ts`: reading a plugin with no entry answers `{}`; saving one plugin's settings leaves another's intact and survives a reload; a failed write returns false.
- `src/plugins/context.test.ts`: `readSettings`/`saveSettings` round-trip for the declaring plugin's id; a revoked plugin reads `{}` and `saveSettings` returns false without writing; a non-object value throws.
- `src/plugins/search/saved-modes.test.ts`: `modesFrom` takes booleans and defaults each missing or non-boolean value to false; `sameModes` compares all three.
- `src/plugins/search/activate.test.ts`: a tab opened after saved modes exist carries them; a search whose modes differ from the saved set saves them once; a rerun with the same modes does not save again.
- `src/plugins/documentation.test.ts`: passes with the new count.

## Spec

- `product/specs/search-tab.md`, the toggles: they are remembered in `.janissary/config.json` and restored when the application next starts. A write that fails leaves them working for the session.
- `product/specs/application-config.md`: a `pluginSettings` row, and the runtime-change paragraph names the search toggles as a runtime writer.
- `product/specs/tab-plugins.md`: the two capabilities, if it lists capabilities.

## Docs

`documentation/user-documentation/getting-started/startup.md` lists every setting in `config.json`, so it gains a `pluginSettings` row, and its runtime-change sentence names the search toggles.

## Out of scope

- Remembering the query, the narrowing fields, or the search history.
- A runtime command to change plugin settings.
- `ai/guidelines/plugins-tabs.md`, whose capability list is already out of step with the contract; the task's scope does not cover guideline files.
