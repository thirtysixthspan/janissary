<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the user documentation to describe the fifth ambient notification event, `commandDisabled`, which the plan and specs add but the user pages still describe as four events (plan fidelity).

Existing Issue: `documentation/user-documentation/tab-types/notifications.md`, `documentation/user-documentation/getting-started/configuration.md`, and the notifications paragraph of `documentation/user-documentation/command-bar/commands.md` still say there are four ambient events and list only `stateChange`, `scheduleFire`, `agentStart`, and `rateLimited`, while `src/config.ts` now defaults a fifth `notifications.events.commandDisabled` that the pull request's own help and specs refer to. Severity: 3/10

Existing Risk: 3/10 - A user who wants refusals of disabled commands in the feed cannot discover the setting or its default-off, active-tab-suppressed behavior from the published docs, and the docs contradict the shipped config.

Proposal Risk: 1/10 - Prose-only edits that mirror `product/specs/notifications.md` and `product/specs/application-config.md`; a missed sentence would again be a wording slip visible in review.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "document the commandDisabled ambient notification event in the user docs". Edit `documentation/user-documentation/tab-types/notifications.md` to change the "four ambient" wording to five in each place, add `commandDisabled` to the example config block, the event table, and the feed-message table with the text `Command is disabled: <command>.`, and note it is attributed to the originating tab and suppressed on the active tab; add a `notifications.events.commandDisabled` row (default `false`) to the table in `documentation/user-documentation/getting-started/configuration.md` and adjust its sentence about ambient defaults; and in `documentation/user-documentation/command-bar/commands.md` change "four ambient event toggles" and mention command-disabled reports. Copy wording from the `command-disabled` paragraphs of `product/specs/notifications.md` so the docs and specs agree. No code or tests change.


* Add direct tests for the hand-written `commands.json` key scanner so escaped quotes, braces inside strings, nested values, and duplicate normalized keys are pinned (technical debt).

Existing Issue: `orderedKeys` in `src/native-commands/decode.ts` is a character-level JSON scanner that decides which duplicate key wins and which entries are malformed, but its only test passes a pre-parsed object plus a trivial text, so the scanner's escape, depth, and comma handling has no colocated coverage. Severity: 3/10

Existing Risk: 4/10 - A key containing an escaped quote, a backslash, or a bracket inside a string value can desynchronise the depth or key tracking, silently dropping or mis-assigning a user's command setting, and the next successful save rewrites the file without it.

Proposal Risk: 2/10 - Only a test file is added, so the risk is a newly written test exposing a real scanner bug that then needs a small fix in the same unit.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "add direct tests for the commands.json key scanner in decode.ts". Create `src/native-commands/decode.test.ts` that calls `decodeCommandSettings(JSON.parse(text), text)` for real file texts covering keys with escaped quotes and backslashes, `{`, `}`, `[`, `]`, and `,` inside string values and keys, a malformed string value at depth one, nested objects and arrays, exact duplicate keys, keys that collide after normalization in both orders (so the textual-last entry supplies both values), an empty key, and non-object top-level values returning `undefined`. If any case fails, fix the scanner in `src/native-commands/decode.ts` minimally in the same change; the existing cases in `src/native-commands/manager.test.ts` must keep passing.


* Replace the `as RunTopicAction` cast and the three hard-coded lists of awaited topic actions with one declared set so adding an awaited action is a single edit (technical debt).

Existing Issue: `src/plugins/topics.ts` exports `runTopicAction = runTopicSourceAction as RunTopicAction`, which erases the overload relationship through a type assertion, and the knowledge that `models/delete` and `commands/set` are awaited is repeated in `src/plugins/api-topic-action-capability.ts`, `src/plugins/context.ts`, and `src/plugins/file-capabilities.ts`, each with its own `topic === ... && action === ...` branch for the disabled-plugin case. Severity: 3/10

Existing Risk: 4/10 - The next awaited topic action must be added in three files and the cast hides a mismatch between the declared overloads and the runtime value, so one missed place returns a synchronous value where callers `await` a promise and a refusal string is lost.

Proposal Risk: 3/10 - The change touches the capability factory used by every plugin, so a regression would affect all plugins' topic actions, though the existing topic and capability tests cover each path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "centralise awaited topic action handling and remove the RunTopicAction cast". Add one helper beside `AwaitedTabPluginTopicAction` in `src/plugins/api-topic-action-capability.ts` that reports whether an action is awaited and returns the disabled-plugin result (`Promise.resolve(undefined)` or `undefined`), use it from `topicActionCapability` in both `src/plugins/context.ts` and `src/plugins/file-capabilities.ts`, and give `runTopicAction` in `src/plugins/topics.ts` real overloads instead of the assertion. Behavior must not change; `src/plugins/topics.test.ts`, `src/plugins/api-topics.test.ts`, and the plugin context tests must pass untouched.


* Define the native tool, settings source, and inventory kind domains once in the import-free shared contract so the server types and the plugin validators cannot drift, as the plan promised (plan fidelity and technical debt).

Existing Issue: The plan says the payload validator's domain sets are shared with the import-free shared contract, yet the native-tool union is declared separately in `src/shared/application-commands.ts` (twice) and as `NativeTool`/`NATIVE_TOOLS` in `src/plugins/commands/shared.ts`, the source union in both `src/native-commands/settings-types.ts` and `src/plugins/commands/shared.ts`, and the kind set only as a local `KINDS` in `src/plugins/commands/payload.ts`. Severity: 3/10

Existing Risk: 3/10 - Adding a native tool kind or a settings source updates the server type but not the runtime guards, so the guard rejects the new rows and the Commands tab or Roles tab fails to open with `invalid commands topic data`.

Proposal Risk: 2/10 - Moving constants and re-deriving types is mechanical, and a wrong import direction would break the import-free rule that `web/src/plugins/commands/chunk-imports.test.ts` already guards.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "declare command inventory domains once in src/shared/application-commands.ts". In `src/shared/application-commands.ts`, export `as const` arrays for native tools, settings sources, and row kinds and derive `ApplicationCommandRow`, `ApplicationCommandDeclaration`, and `ApplicationCommandKind` from them; make `src/native-commands/settings-types.ts` and `src/plugins/commands/shared.ts` import or re-export those types and build `NATIVE_TOOLS`, `SOURCES`, and the kind set in `src/plugins/commands/payload.ts` from the same arrays, keeping the plugin contract import-free of server modules. Existing tests in `src/plugins/commands/payload.test.ts`, `src/plugins/commands/shared.test.ts`, and `web/src/plugins/commands/chunk-imports.test.ts` must pass unchanged.


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
