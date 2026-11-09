<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make the Commands tab and docs say when a valid project `commands.json` replaces home restrictions the project file leaves enabled, so a cloned repository cannot silently lift a user's own denials (security).

Existing Issue: A valid project `.janissary/commands.json`, including an empty `{}`, replaces the home file entirely and every omitted command or field defaults to enabled, so a repository's file silently re-enables commands and agent access the user disabled in `~/.janissary/commands.json`, and nothing in the snapshot or tab says a home restriction was discarded. Severity: 4/10

Existing Risk: 4/10 - A user who denied agents `browser eval` globally can open an untrusted project whose committed file lifts that denial, and the only hint is the `Editing <path>` line in a tab they may never open.

Proposal Risk: 2/10 - The replacement semantics the plan chose stay unchanged and only a visible notice is added, so the hole is made visible rather than closed and still depends on the user reading it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "surface home restrictions discarded by a project commands.json override". In `src/native-commands/settings-file.ts`, when the project file is the effective source and the home file is also readable, collect the commands the home file disables or denies agent access that the project file leaves enabled, and return that count and names as an optional `overridden` field on the read result carried through `createSnapshot` in `src/native-commands/manager.ts` into `CommandSettingsSnapshot` in `src/native-commands/settings-types.ts`. Extend `isCommandsData` in `src/plugins/commands/payload.ts` and the Commands payload and its schema version, show one note line beneath the source line in `web/src/plugins/commands/CommandsTab.tsx`, and document it in `product/specs/application-commands.md`, `product/specs/commands-tab.md`, and `documentation/user-documentation/tab-types/commands.md`. Dispatch, ACP filtering, and the replacement rule must not change. Add tests in `src/native-commands/manager.test.ts` and `web/src/plugins/commands/CommandsTab.test.tsx`, and bump `COMMANDS_PAYLOAD_SCHEMA_VERSION` with its registry entry in `web/src/plugins/registry.tsx`.
