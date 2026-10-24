# Let a tab plugin ask which of its own tabs are open

**Complexity: 5/10** — one additive server capability, declared and documented the way the existing own-tab capabilities are, then used by the SQL and diff plugins to prune their per-tab copies before reusing one.

## Goal

A SQL or diff tab that was closed and is opened again starts fresh instead of picking up the copy the plugin kept for the closed tab. Reopening a closed SQL tab reads the schema again, and closing a remote workspace diff tab and running `diff on <tab>` again rejoins the remote channel instead of focusing a tab that no longer exists.

## Approach

Notifications reach only plugins that own at least one tab, so a stateful plugin that prunes on notification never prunes once its last tab has closed. `SqlTabs` reopens from `tabs.read(key)` whenever an entry survives, and `DiffSession.openRemoteWorkspace` treats a surviving entry as an open tab and refocuses it through `openOrFocusTab` instead of joining through `launchTab`.

Add an `ownTabKeys(): readonly string[]` server capability that answers the instance keys of the calling plugin's own open tabs, using the same plugin-id scan `pluginTabByInstanceKey` uses, and an empty list while the plugin is disabled. It is additive, so `TAB_PLUGIN_API_VERSION` does not move. Both plugins declare it and prune against its answer before reusing anything.

`src/plugins/documentation.test.ts` pins the developer documentation's capability count and list to the code, so this change also edits `documentation/developer-documentation/tab-plugins.md` (count, list entry, changelog line) and extends that test's number-word list past forty-seven. That file sits outside the task's usual doc set, but the fix cannot pass its tests without it.

## Implementation steps

1. Declare `ownTabKeys` on `TabPluginOwnTabCapabilities` in `src/plugins/api-own-tab.ts`, implement it in `src/plugins/own-tab-capabilities.ts`, and add it to the capability union and `CAPABILITIES` in `src/plugins/api-capabilities.ts`.
2. Document it in `documentation/developer-documentation/tab-plugins.md` (forty-eight capabilities, a list entry, an API changelog line) and add `'forty-eight'` to `COUNT_WORDS` in `src/plugins/documentation.test.ts`.
3. Declare it in `src/plugins/sql/manifest.ts` and prune `SqlTabs` against it in `openDatabase` (`src/plugins/sql/open-tab.ts`) before the existing-payload check, which covers the command and the switch intent.
4. Declare it in `src/plugins/diff/manifest.ts` and prune `DiffSession.tabs` against it (disposing each dropped tab) at the start of `open`, `openWorkspace`, and `openRemoteWorkspace`, so every `tabFor` and the `existing` check see only open tabs.
5. Update `product/specs/tab-plugins.md`, `product/specs/sql-database.md`, and `product/specs/diff-tab.md`.

## Tests

- `src/plugins/context.test.ts`: `ownTabKeys` answers only the calling plugin's open tabs' instance keys, and an empty list once the plugin is disabled.
- `src/plugins/sql/activate.test.ts`: closing the last SQL tab and opening the same database again starts from an empty payload and asks for the schema again.
- `src/plugins/diff/activate.test.ts`: closing a remote workspace diff tab and running `diff on <tab>` again joins through `launchTab` rather than refocusing through `openOrFocusTab`.

## Out of scope

- Carrying `{ instanceKey, payload }` on each notification's `tabs`, which would let `SqlTabs` drop its payload copy; a separate API change.
- The launcher and conversations plugins' notification-only pruning.
