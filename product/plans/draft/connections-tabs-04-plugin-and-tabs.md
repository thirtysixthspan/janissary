# Connections plugin and connection tabs

**Complexity: 5/10**

## Goal

Add the bundled `connections` tab plugin with its command and alias, singleton list tab, and per-record connection tabs for persistent ACP and agent-run history.

## Decisions and dependencies

- Covers source-plan requirements 1–2, 7–8, 11–19, 21–24, 25–26, 33–36, and the plugin/list/connection-tab test requirements. The plugin owns the `connections` command and `connection` alias; core `tasks` remains untouched.
- Depends on subplans 01–03 for records, cancellation/agent state, and topic actions/data. No future shell or API-v3 work is required for this plugin's list and record tab surfaces.
- Command rules: bare `connections` opens/focuses the singleton; `left`/`right` dock; bare while docked returns to center; `list` and `close` retain their current outputs/notifications/completion; other text follows `connection <text>`. Singular `connection` resolves `<kind>:<id>` first, then ACP title case-insensitively, newest first, otherwise reports `No connection matching "<text>".`
- ACP tabs show transcript blocks read-only when closed; active records have Cancel and Close session. Agent runs show Terminate only, disabled during cleanup. Thought/tool entries start collapsed; an active tab follows output, and older records page in 20-block windows.

## Existing code to reuse

- Server plugin structure in `src/plugins/conversations/` and its model in `src/plugins/conversations/tabs.ts`; plugin catalog/loader registration conventions.
- Client conversations list keys, two-click selection, stick-to-bottom behavior, and older-window paging in `web/src/plugins/conversations/` as colocated patterns. Do not import concrete code across plugins.
- `ConnectionWindow`'s existing display text and `connectionCatalog` semantics from `src/connection/`.

## Proposed changes

- Add `src/plugins/connections/manifest.ts`, import-free `shared.ts`, pure `parse.ts` (own copy of six kind names), activation, and tab model. Claim command plus alias, the connections topic, and only required capabilities (`openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `originTab`, `rejectRequest`, `reportFailure`). Register static manifest, literal server loader, and literal client loader.
- Move command parsing/execution into the plugin. Remove `src/commands/connections.ts`, its registry entry, `ConnectionManager.run`, and `src/connection/parsing.ts`; move prior command tests into plugin command coverage. Keep `listLines` in `src/connection/list.ts`; remove duplicate command definition so the core command name becomes available to the plugin.
- Add `web/src/plugins/connections/` with list and connection-tab components plus a controller hook. Render flat rows sorted by last activity with title, kind, owner, and status; implement Up/Down/Home/End/Enter and two-click opening, non-ACP close controls, open-ACP close, and confirmation before deleting a closed row.
- Render record metadata (title, model, owning tab, status, start/end times), ordered prompt/activity/answer blocks, and status-specific controls. Load newest 20 blocks at open, page older blocks at the top while preserving viewport, follow active output, and show `No connections yet` when empty.
- Non-ACP opening focuses the owner; sqlite resolves the topic's focus target. ACP rows open their record tab. Retain closed owner names and open closed records read-only.

## Tests

- Server: plugin registration/activation/disposal, parser and command forms, docking, list text parity, close notifications, id/title matching, intents, rejection/failure, topic updates, and import-free shared payload guards.
- Client: list empty/render/keyboard/two-click/close/delete confirmation; metadata/actions by status; agent Terminate; collapsed activity; follow-bottom and older paging; lazy chunk loading.

## Verification

- Run diff-scoped checks and a production web build; inspect that the connections client ships in its own lazy chunk.
- Verify command completion still resolves `connections close` through the plugin-owned grammar and no core command definition remains.

## Out of scope

- ACP activity capture/cancel transport (subplan 02), host topic implementation (subplan 03), shell reply rendering and popup callback integration (subplan 05), API contract removal (subplan 06), and docs (subplan 07).
- Prompt input in connection tabs, reopening closed sessions, history for non-ACP connections, and changes to agent-monitor or task picker.
