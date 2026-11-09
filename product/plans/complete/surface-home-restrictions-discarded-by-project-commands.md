# Surface home restrictions discarded by a project commands.json

**Complexity: 4/10** — one optional field threaded from the settings reader through the snapshot, the Commands payload, and one note line in the tab, plus a payload schema bump.

A valid project `.janissary/commands.json` replaces the home file entirely, so commands or agent access the user disabled in `~/.janissary/commands.json` come back on when the project file leaves them enabled, and nothing says so.

## Goal

Tell the user, in the Commands tab and the docs, which home restrictions a project file lifts. Replacement semantics, dispatch, and ACP filtering do not change.

## Approach

1. `settings-file.ts` gains `homeRestrictionsLifted(homePath, projectValues)`: reads the home file when it is readable and returns, in application-command order, the names the home file disables or denies agent access that the project values leave enabled (`enabled` or `agentAccess` respectively). `readCommandSettings` adds `overridden` to the result only when the project file is the effective source and the list is non-empty.
2. `CommandSettingsRead` and `CommandSettingsSnapshot` carry `overridden?: readonly string[]`; `createSnapshot` passes it through. After an edit that writes the project file, the manager recomputes it from the saved values so the note tracks the edit.
3. `isCommandsData` and `isCommandsPayload` validate `overridden` as an optional string list; `toPayload` copies it. `COMMANDS_PAYLOAD_SCHEMA_VERSION` and the registry entry move from 1 to 2.
4. `CommandsTab` shows one note line beneath the source line: `This project file lifts N home restriction(s): a, b.`
5. Update `application-commands.md`, `commands-tab.md`, and the user documentation page.

## Tests

- `manager.test.ts`: project file lifts a home disable and a home agent denial; no note when the project file keeps the restriction, when no home file exists, or when the home file is the source; the note updates after an edit to the project file.
- `payload.test.ts`: accepts and rejects `overridden`, and `toPayload` preserves or omits it.
- `CommandsTab.test.tsx`: renders the note, and omits it when absent.

## Out of scope

- Merging, blocking, or confirming the override; the replacement rule is unchanged.
