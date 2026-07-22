# Configurable Tab Label Truncation

**Complexity: 4/10** — the behavior is a small display rule, but both configured limits must travel through the existing server state snapshot into central and sidebar tab strips, and file-backed tabs must retain their full filename instead of storing a shortened title.

## Goal

Show long tab names with an ellipsis instead of silently cutting them off. Inactive tabs use the configured short display limit, while the focused tab expands to a separate configured limit that defaults to 50 characters. Both values live in `.janissary/config.json`, and file-backed tabs retain their full filename so focus can reveal more of it.

## Approach

- Keep `tabNameMaxLength` as the inactive-tab display limit with its existing default of 16.
- Add `activeTabNameMaxLength` with a default of 50 and send it beside the existing limit in every state snapshot.
- Derive the rendered label in the web client from the full display name, the tab's active state, and the appropriate configured limit. When a name exceeds its limit, reserve the last displayed character for the single ellipsis symbol `…`.
- Stop truncating image, Markdown, and editor filenames when their tabs are created. Existing agent and harness naming constraints remain unchanged because those labels are routing identifiers rather than file display names.
- Apply the same rendering rule to central and sidebar strips. In a sidebar, the visible docked tab is the focused entry for purposes of the expanded limit.

## Implementation steps

1. Extend application configuration and the state protocol with `activeTabNameMaxLength`, including the default config file and server configuration tests.
2. Thread the active and inactive limits through the web socket state listener, `App`, `AppShell`, `Sidebar`, and `TabStrip` into `TabItem`.
3. Add a focused label-formatting helper and render full names through it, with tests for inactive truncation, active expansion, ellipsis behavior, and configured limits.
4. Preserve full filenames in newly created image, Markdown, and editor tabs, updating creator tests to pin that behavior.
5. Update the application-config, tabs, and sidebar functional specs plus the existing startup configuration reference. `help.md` does not document tab-label configuration, so it needs no change.

## Tests

- Extend `src/config.test.ts` to verify the new default is written and custom active/inactive limits are loaded.
- Extend `src/tab/creators.test.ts` to verify file-backed tab titles retain the complete filename.
- Extend `web/src/ws.test.ts` to verify both limits arrive through the state listener.
- Extend `web/src/TabStrip.test.tsx` to verify inactive tabs use the short limit, the active tab uses the expanded limit, an over-limit label ends in `…`, and short labels remain unchanged.

## Out of scope

- Changing the 50-character inline rename input cap.
- Changing agent or harness routing-label validation and creation limits.
- Dynamically measuring available tab-strip pixel width.
- Adding a runtime command or settings UI for either configuration value.
