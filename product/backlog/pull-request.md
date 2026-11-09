<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Ignore auto-repeated key events when a disabled command-backed shortcut is blocked, so holding the key reports it once (functionality gap).

Existing Issue: `handleChordKeys` in `web/src/useWindowKeys.ts` sends `reportBlockedCommand` on every keydown of a blocked chord with no check of `KeyboardEvent.repeat`, so holding `Ctrl+R` or `Cmd+T` while its command is disabled sends one RPC per repeat and the server records one `command-disabled` notification per repeat. Severity: 2/10

Existing Risk: 3/10 - A held key floods the socket and, with the ambient toggle on for a background tab, fills the notification feed with identical refusals.

Proposal Risk: 1/10 - The key is still consumed and prevented; only the repeated report is skipped.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "report a blocked shortcut once per key press". In `handleChordKeys` in `web/src/useWindowKeys.ts`, keep `preventDefault()` and the consume return for every keydown but send `reportBlockedCommand` only when `e.repeat` is false. Add a case to `web/src/useWindowKeys.test.ts` that dispatches a repeated keydown for a blocked chord and asserts the key is consumed with no extra `reportBlockedCommand`, beside the existing blocked-shortcut cases.


* Build the application command inventory once instead of rebuilding and re-sorting it on every dispatch, completion, and edit (technical debt).

Existing Issue: `listApplicationCommands` in `src/application-commands.ts` recreates, normalizes, and sorts roughly a hundred rows on each call, and `resolveApplicationCommand`, `resolveExactApplicationCommand`, `disabledApplicationCommand`, `completionPolicy.allows` (once per browser subcommand), `createSnapshot`, and `serializeCommandSettings` each call it again, although the inventory depends only on static registries. Severity: 2/10

Existing Risk: 2/10 - Every command-bar line, completion keystroke, and ACP call pays the rebuild, which is unnoticeable now but compounds as rows or call sites grow.

Proposal Risk: 3/10 - A cached inventory must still reflect a plugin catalog or claim set that tests replace with `vi.mock`, so a stale cache could hide a test or startup ordering mistake.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "memoise the application command inventory". In `src/application-commands.ts`, compute the sorted rows lazily once and return the cached array from `listApplicationCommands`, exporting a small reset used only by `src/application-commands.claims.test.ts` where `./plugins/catalog.js` is mocked. Behavior must not change; `src/application-commands.test.ts`, `src/application-commands.claims.test.ts`, and `src/native-commands/manager.test.ts` must pass untouched.


* Make the Commands tab and docs say when a valid project `commands.json` replaces home restrictions the project file leaves enabled, so a cloned repository cannot silently lift a user's own denials (security).

Existing Issue: A valid project `.janissary/commands.json`, including an empty `{}`, replaces the home file entirely and every omitted command or field defaults to enabled, so a repository's file silently re-enables commands and agent access the user disabled in `~/.janissary/commands.json`, and nothing in the snapshot or tab says a home restriction was discarded. Severity: 4/10

Existing Risk: 4/10 - A user who denied agents `browser eval` globally can open an untrusted project whose committed file lifts that denial, and the only hint is the `Editing <path>` line in a tab they may never open.

Proposal Risk: 2/10 - The replacement semantics the plan chose stay unchanged and only a visible notice is added, so the hole is made visible rather than closed and still depends on the user reading it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "surface home restrictions discarded by a project commands.json override". In `src/native-commands/settings-file.ts`, when the project file is the effective source and the home file is also readable, collect the commands the home file disables or denies agent access that the project file leaves enabled, and return that count and names as an optional `overridden` field on the read result carried through `createSnapshot` in `src/native-commands/manager.ts` into `CommandSettingsSnapshot` in `src/native-commands/settings-types.ts`. Extend `isCommandsData` in `src/plugins/commands/payload.ts` and the Commands payload and its schema version, show one note line beneath the source line in `web/src/plugins/commands/CommandsTab.tsx`, and document it in `product/specs/application-commands.md`, `product/specs/commands-tab.md`, and `documentation/user-documentation/tab-types/commands.md`. Dispatch, ACP filtering, and the replacement rule must not change. Add tests in `src/native-commands/manager.test.ts` and `web/src/plugins/commands/CommandsTab.test.tsx`, and bump `COMMANDS_PAYLOAD_SCHEMA_VERSION` with its registry entry in `web/src/plugins/registry.tsx`.
