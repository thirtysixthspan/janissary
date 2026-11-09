# Native application commands

**Complexity: 9/10** — command metadata, persistence, client and server enforcement, ACP routing, a plugin topic, and two tab surfaces span the application.

Maintain native application commands in a registry and expose their availability in a Commands tab. This gives users control over application-wide command availability and which commands agents can call through ACP.

## Design decisions

### Inventory

- List application commands and subcommands alphabetically in a table with application-wide availability controls. Show an agent access toggle only for commands available as native ACP tools. All commands are enabled by default.
- Include all built-in application commands and identifiable subcommands, including the nine native ACP commands, as well as bundled plugin commands.
- Derive the inventory from the registered core commands, `help`, accepted bundled-plugin claims and aliases, and the native ACP vocabulary. Rejected plugin claims never enter the inventory: the plugin command adapter exposes `claimPluginCommands`, one `{ declarationId, name, command }` per accepted claim, and the inventory builds each plugin row from its declaration's accepted names only, so a claim on a reserved core name such as `open` contributes neither a row nor an alias.
- Build the sorted inventory once, lazily, and return the cached array from every later call; it depends only on static registries and no caller mutates the rows.
- Give named, fixed application subcommand forms their own rows. Filenames, SQL text, and other user-supplied values are arguments, not separate rows. Fixed forms end at the command/subcommand boundary. A built-in declaration whose first form is its own name expands into a parent row holding only that form plus one child row per remaining fixed form, named by the full form and linked to the command as its parent, so `tab dock` can be disabled without disabling `tab focus` or `tab`, and `db sqlite query` is parented to `db sqlite`. The shared-name rows below and the `question` declaration, whose forms are native rows, stay as they are.
- Keep the intentional duplicate-name rows: `ask`/`ask reset`, `tell`/`tell reset`, and `search`/`search transcript` share one canonical setting key while remaining separate display rows.
- Keep the plugin `shell` row, which controls the `shell` command. The builtin `!` form is explicit shell execution, not an application command, and is not a row.
- Normalize names by trimming, collapsing repeated whitespace, and case-folding. Canonicalize aliases to their owning row, represent parent relationships explicitly, and associate native forms with their existing tool category.
- Preserve the existing ordered, `match`-based owner resolution in `resolveCommand` and `findCommand`; a plugin and builtin may share a name, as with `search`. Apply the longest declared fixed form only within the resolved owner's metadata, so policy never reroutes a command or changes an alias.
- Include `help` as inventory data without adding a second executable definition. Its canonical row and fixed forms describe the existing `getOutput` path and preserve bare/named help and unknown-input replies. The dispatch policy's help gate is `getOutput(commandText).kind === 'output'`; the inventory module exports no separate help helper.
- Put browser-shared inventory and disabled-command row types in an import-free module under `src/shared/`, and keep the wire contract in `src/protocol.ts`. That module declares the native tool, settings source, and row kind domains once as `as const` arrays (`APPLICATION_COMMAND_NATIVE_TOOLS`, `APPLICATION_COMMAND_SOURCES`, `APPLICATION_COMMAND_KINDS`) and derives the types from them; the settings types, the Commands shared contract, and the ACP native-command module alias those types, and the Commands guard sets are built from the arrays.
- Share one command-name normalizer and form matcher across server and client in the import-free `src/shared/command-matching.ts` (`normalizeCommandName`, `atFormBoundary`, `matchesCommandRow`, `rankCommandRows`, typed over rows carrying `name`, `aliases`, and `forms`). The server resolver, the settings decoder and settings file, and the browser's disabled-command check all import it, so a tie-break change cannot make the client decide differently from the server. The search-owner special case stays on the server.
- Add one effective-setting helper, `effectiveCommandSetting`, taking the optional snapshot and a canonical row name and returning the effective enabled and agent-access values with enabled defaults. Dispatch policy, the ACP tool runner, and the ACP allow-list read availability through it, so the rule that a missing snapshot or row means enabled lives in one place.

### Settings

- Store registry configuration in `~/.janissary/commands.json`, with a project override at `.janissary/commands.json`.
- When the project file exists and is valid, it replaces the home file entirely, as with roles configuration. When the home file is readable, the snapshot also carries an optional `overridden` list, in application-command order, of the commands the home file disables or denies agent access that the project values leave enabled; it is present only when the project file is the effective source and the list is non-empty, and an edit that writes the project file recomputes it from the saved values.
- `commands.json` is a JSON object keyed by canonical command name. Each value has optional boolean `enabled` and `agentAccess` fields; omitted fields default to true.
- Missing command or toggle settings default to enabled, including for newly introduced commands and in a project override.
- Match command names case-insensitively, trim surrounding whitespace, and collapse repeated spaces. Display and save canonical spelling.
- If multiple file keys normalize to the same command name, use the last entry in textual file order and remove duplicates when saving.
- Ignore malformed individual entries, use enabled defaults for them, and permit a subsequent successful save to remove them. Malformed entries do not make the file unusable.
- Remove settings for unknown commands when saving `commands.json`.
- Follow the roles configuration failure behavior: an unusable project file falls back to the home file, then defaults; report the problem, preserve damaged files, and refuse edits to an unusable effective file.
- File fallback messages follow Roles wording: `commands.json <problem> at <path> — showing the <home|project> commands file.` or `commands.json <problem> at <path> — showing default commands.`
- An edit of an unusable effective file is refused with `commands.json at <path> is unusable — fix the file before editing commands.`
- When the project file is unusable and the home file is in effect, a successful edit publishes a snapshot that keeps the damaged project file's problem, as a refresh would, and names the home file as the destination.
- A name passed to the manager's edit or the topic's `set` action must equal a canonical name, alias, or fixed form exactly after normalization, resolved through an exact-resolution helper beside `resolveApplicationCommand`; trailing words are refused as unknown without writing a file.
- If neither file exists, the first toggle change creates `~/.janissary/commands.json`; when a valid project override exists, edits go to that file instead.
- Save each toggle change immediately, applying and publishing it only after the write succeeds, as the Roles tab does.
- Re-read configuration at initialization, when the Commands tab opens, and before each toggle edit. Apply hand edits at those points; do not continuously watch the file.
- A failed configuration write leaves the effective state unchanged and returns `Could not write commands.json at <path>.`.
- Use `atomicWriteFile` for replacement. Concurrent edits may each read the same effective file; the last full-file write wins, even if it overwrites an earlier edit. Each successful write publishes the exact settings it wrote. This intentionally allows lost updates under concurrent editing.
- Hold the effective settings in a host-owned `nativeCommandSettings` manager registered with `Managers` and constructed in `createManagers`; do not add another registry or per-tab settings map. A missing manager or row means enabled.
- A fixed-form child's effective global availability requires its own saved `enabled` value and every declared parent's `enabled` value. Effective agent availability additionally requires `agentAccess` for the native ACP command and each native ACP parent; a non-native command has no agent-access restriction.
- A successful settings publication is published to open plugin views and re-broadcasts the client state snapshot, so every connected client's disabled-command list matches the server.

### Dispatch

- Application-wide disabling blocks dispatch through every path: command bars, scripts, schedules, plugins, and ACP.
- A command whose effective setting is disabled is refused wherever the server dispatches it: a tab's command bar, a plugin line or queue dispatch, a scheduled command, or a skill-granted agent command. The refusal is exactly `Command is disabled: <command>.`, where `<command>` is the canonical name of the matched row; a native child's row name is its full fixed form, and an alias reports its canonical command.
- Apply the refusal only when the input matches a registered command or `help`. Input that matches no command keeps the ordinary unknown-command reply even when it begins with a disabled command's name, so `quit now` is not refused as `quit`.
- Registry `match` functions are often `/^name\b/i` regexes that also accept `ask:hello`, `ask-hello`, or `db.sqlite`, which the inventory matcher does not resolve to a row. Identify the row with the longest-fixed-form match when there is one; otherwise resolve the name of the first registry command whose `match` accepts the line (an optional `fallbackName` on `disabledApplicationCommand`) and apply the same effective-setting check, so every spelling the registry routes to a disabled command is refused.
- Keep owner selection independent from policy: resolve with the existing ordered registry/plugin rules, then select the longest matching fixed form from that owner's inventory metadata and apply its canonical setting and effective parent settings. A policy-disabled match remains claimed and is refused, never handed to another owner or a shell.
- Preserve existing capability-based `Command.available` behavior; it is a separate execution constraint, not the global setting.
- Check queued and scheduled commands at dispatch time; refuse a command disabled before it runs with the normal disabled-command notification. An invocation already running when its command is disabled may finish; subsequent invocations are refused.
- Preserve skill grants as a separate gate. A granted command disabled by settings returns the refusal as the tool result without losing the dispatch result to capture suppression.
- Apply the same refusal before effects in direct `executeCommand` calls and every line-dispatch wrapper, including plugin line dispatch, queued dispatch, and skill-granted dispatch.
- Keep disabled commands in help, but hide them from command completion.
- `help` is subject to the same policy. While enabled it continues to list disabled commands; while disabled, both bare and named help return the canonical refusal instead of help text or an unknown-command reply.
- Exclude explicitly requested shell execution (`!…`) from command policy.
- Report disabled-command refusals through notifications. A refused ACP call also returns the failure to the agent. Usage, unknown-name, save, and other existing command errors keep their normal command replies.
- Attribute each disabled-command notification to the originating tab and use an ambient event, so focus suppression and notification settings can hide it. Suppression affects delivery only, never the enforcement check or the ACP return value.
- The `commands` command can itself be disabled. If its tab is closed afterward, re-enable the command by editing the effective `commands.json` file.

### Completion

- Add a first-token application-command candidate source over the canonical inventory so enabled command names and aliases are offered before filesystem paths.
- Offer command names only for a non-empty bare word with no `/`, `\`, or quote. An empty token, a token beginning with `!` or `/`, and a token containing a path separator keep the existing filesystem completion. Candidate matching stays case-sensitive.
- Read the settings snapshot once per completion request. Do not refresh, read `commands.json`, subscribe, or cache across requests.
- Resolve the words already typed before the cursor through `resolveApplicationCommand` after dropping one leading `/`. If the longest matching form is disabled, return the existing empty result immediately, suppressing argument and path completion under a disabled command or native child.
- Filter a disabled native child out of its command's argument-1 subcommand candidates while enabled siblings remain. Shared canonical names share one setting, so disabling the name hides every owner and form with that name.
- While `help` is enabled, do not filter `help` output, the command table, or help-page completion; disabled commands stay listed and their pages stay completable. When `help` itself is disabled, its command word and page completion are suppressed like any other disabled command.
- Do not add `Command.available` or tab-capability filtering to completion; it keeps its existing context behavior.

### ACP

- Filter the commands an agent is told it may use to the intersection of the role's grants and the current effective agent access, in native-command catalog order and deduplicated.
- Keep every included owner's group primer even when all of its commands are excluded. Emit `Only these commands are allowed: <commands>.` only when the intersection is non-empty; keep the group descriptions alone when it is empty. A role with no recognized grants still gets no table and no primer.
- Keep `createAcpToolTable` owner selection on the full grants, not the enabled intersection, so a granted command that is disabled or agent-off is still extractable and returns a refusal instead of becoming a final answer.
- Check the current settings immediately before every emitted call, before the role-grant check. A disabled command returns `Command is disabled: <command>.`; an enabled command with agent access off returns the same message and also emits the `command-disabled` notification. The disabled check comes first, so a disabled command the role did not grant reports the disabled refusal.
- Agent access is a permission setting, not a way to expose new ACP tools: only commands already exposed as native ACP tools are available to agents. `agentAccess` can only remove commands from the role's grants; it never adds a tool.
- Route enabled, granted native calls through the ordinary command dispatcher instead of direct browser, database, or question service calls. Carry the prompt's abort signal and `awaitResult`, and mark the invocation as an ACP tool.
- Give ACP dispatch its own no-deadline entry point so a pending question or slow browser call is not settled by the plugin capture deadline. Return the existing dispatch result shape and convert it to the loop's string with the skill-granted agent rule.
- Branch the browser, database, and question command handlers on the ACP invocation so the agent receives the browser run, database result, or question answer without an interactive or appended duplicate. Preserve the single `acp: true` transcript entry.
- Preserve cancellation: an aborted prompt stops a new command, a pending question resolves `Question cancelled.`, and late browser or database results and the next provider turn are suppressed. A command already executing is not interrupted; the next emitted command re-checks.

### Commands tab and topic

- Publish the inventory and effective availability through a narrow `commands` host topic. Its notification data is the settings snapshot verbatim: source, path, optional problem, and the canonical rows with saved and effective flags, parent, and native tool.
- A synchronous `refresh` action re-reads the effective file and publishes. A single awaited `set` action changes exactly one toggle on one command named exactly by any canonical name, alias, or fixed form. `agentAccess` on a non-native row is refused with `Not a native ACP command: <canonical>.` without a write.
- One declared place says which topic actions are awaited and what a disabled plugin gets back for them: `src/plugins/api-topic-action-capability.ts` exports `isAwaitedTopicAction` and `disabledTopicActionResult` (a resolved `undefined` for an awaited action, `undefined` otherwise), both plugin capability factories use it, and `runTopicAction` in `src/plugins/topics.ts` carries real overloads instead of a type assertion, with `subscribeTabs` moved to `src/plugins/tabs-topic.ts` to stay under the file-size limit.
- Subscribe the topic directly to the settings manager and deliver notifications only to an already-active plugin with an open tab; a notification never activates a plugin. Reading the topic never refreshes it.
- Keep the topic additive: `TAB_PLUGIN_API_VERSION` stays 3. The Commands plugin starts its payload schema at 1, including its optional `overridden` string list, and the client registry's duplicated literal stays at 1 too; the Roles payload schema becomes 4.
- Bare `commands` opens the singleton Commands tab in the center and focuses an existing one wherever the host placed it. The plugin never docks or undocks itself and declares no dock form, so `commands left` is a usage error. The host's generic `tab dock` can still dock it.
- Re-read the effective file when the tab opens: call the topic's synchronous `refresh`, then read `topicData('commands')`, then open the tab. Never refresh from the notification handler or the topic read path.
- Edit forms `commands enable|disable [agent|global] <command>` do not open or focus the tab. Omitted selector means `global`; `agent` changes agent access. The text after the optional selector must match a canonical name, alias, or declared fixed form exactly after trimming, collapsing whitespace, and case-folding; trailing words are never ignored.
- Match canonical names first, then aliases, then fixed forms across every row, so a native row's canonical name wins over an earlier row's fixed form. `commands enable question ask` targets the native `question ask` command rather than the builtin `question` command.
- A leading `agent` or `global` is the selector only when at least one more word follows; otherwise `agent` is the command name (so `commands disable agent` disables `agent` globally) and `global` is a missing command.
- Exact replies: `Usage: commands [enable|disable [agent|global] <command>].` for malformed or missing forms; `Unknown application command: <command>.` with the typed remaining text trimmed and whitespace-collapsed but preserving case; `Not a native ACP command: <canonical>.` from the topic for `agent` on a non-native row; and the settings service's unusable-file or failed-write message for those cases.
- Successful changes and already-set values are silent. The command handler does not refresh before an edit because the topic's `set` action re-reads before saving. It can save a child setting while a parent is disabled; the child remains effectively disabled until the parent is enabled.
- The `commands` command is an ordinary row. While its tab is open the toggle can re-enable it; the plugin never closes the tab on that publication. Once the tab is closed, a disabled `commands` is refused at dispatch like any other command, and recovery requires editing the effective `commands.json` file. Do not add a special recovery command.
- The settings manager is application-wide, rooted at the application's project root. Do not resolve a project from the invoking tab or add per-project state; the payload's source and path name the effective file.
- Implement the center-only Commands plugin under `src/plugins/commands/` and `web/src/plugins/commands/`, declaring it in the catalog and literal loader maps. Its command handler routes bare `commands` to the tab and enable/disable forms to the host service.
- Follow the Models and Roles patterns without cross-feature client imports. The plugin reaches the topic contract through `CommandsTopicNotification['data']` re-exported from `src/plugins/api.ts`, never through `../native-commands/`, and maps it to an import-free client payload. It resolves names and canonical parents from the topic snapshot's rows because the plugin import boundary does not admit `src/application-commands.ts`.
- Keep the plugin API additive and capability-narrow; validate topic actions and plugin intents at their ingress. The Commands manifest declares `openOrFocusTab`, `updateTab`, `topicData`, `topicAction`, `rejectRequest`, and `reportFailure`, with `commands` in `notifications` and no `dockTab`.
- Share the payload validator's domain sets with the import-free shared contract so the topic validator and client guard cannot drift. The server-plugin boundary rule admits `../../shared/application-commands.js` as the one allowed specifier for this.
- Declare a `refresh` plugin intent, guarded by an empty-payload check (`isRefreshIntent`), that sends the topic's `refresh` action and returns null; the Commands tab's Refresh button uses it.

### Commands tab UI

- The Commands tab mirrors the existing Models tab and presents an alphabetical table with an application-wide toggle and, only for native ACP tools, an agent access toggle.
- `commands` opens or focuses the singleton in the center, like Roles; it does not dock.
- Above the table, a metadata bar like the Models tab's carries a Refresh button and the split-tab action at its right, and floats the source line at its left: `Editing <path>` for the effective file or `No commands file in effect` when using defaults. When the tab is docked the dock owns the actions slot, so the source line renders as its own row instead.
- When the payload carries `overridden`, show one note beneath the bar: `This project file lifts N home restriction(s): a, b.`
- Show file problems and refused edits beneath the bar, like Roles. A failed save leaves the last successfully saved toggle state visible.
- Rows come in the server's canonical-name order; do not re-sort by label.
- Label a row by its canonical command name when that name is one of its forms, or when its first fixed form is another row's name; otherwise show its first fixed form. The builtin `question` row therefore reads `question` while the native `question ask` row reads `question ask`, and `ask reset`, `tell reset`, and `search transcript` keep their distinct labels. Key each row by canonical name and label together.
- Every row has an Enabled checkbox; rows for native ACP commands also have an Agent access checkbox, and the Agent access column is present whenever the table has rows.
- Checkboxes show the saved setting, never whether the command is currently available.
- Dim a subcommand disabled by its parent, disable both of its toggles until the parent is enabled, and retain its saved values. Provide the explanation `Disabled by parent command: <parent>.`
- A native command whose parent denies agent access keeps its saved Agent access value, disables only that checkbox, and shows the same note without dimming the row. A command disabled on its own keeps an interactive Enabled checkbox so it can be turned back on, but its Agent access checkbox stays disabled until it is enabled.
- Pending saves are keyed by canonical name and setting; every row sharing that canonical setting disables together, and no other setting is affected. Do not optimistically flip a checkbox: it changes only when the next successful publication arrives. On failure, clear pending, keep the last successful checked state, and show the refusal; the next change clears it.
- Use native checkbox controls for toggles, with browser-provided checked state and Space activation. The accessible names are `Enabled: <label>` and `Agent access: <label>`.
- Add only Up and Down navigation between command rows: move focus to the same toggle in the previous or next row, falling back to that row's Enabled toggle when the matching toggle is missing or disabled. Skip rows where both toggles are unavailable, including while a save is pending, and stop at the first and last row. Leave Enter, Space, Escape, and every other key to the browser and host.
- Keep the alphabetically sorted command table horizontal at all pane widths, with horizontal scrolling when narrow, including when docked. Use the Models table's spacing, borders, muted disabled rows, and theme colors, with source and problem lines like Roles.
- Show `No commands` for an empty inventory. Do not add a loading state; the tab is created with a complete payload.
- Client code belongs in a feature directory with decisions in pure modules and hooks and thin components, without imports from other features. Server-owned state remains on the server.

### Roles

- The Roles tab displays agent-disabled grants dimmed with a tooltip, including grants added while disabled. The Roles payload gains a required `commandRestrictions` field, and its schema version becomes 4.
- Record a restriction only for a native ACP command that is currently restricted: `application-wide` when effective availability is off, otherwise `agents` when only effective agent access is off. Application-wide wins when both are off, and a disabled parent counts as application-wide for every command beneath it.
- The restriction is display state only. It is never written to `roles.json`, never filters the picker, and never refuses an add or remove. A grant added while its command is restricted is stored normally and is dimmed by the republish that follows the edit.
- Roles reads the snapshot through `topicData('commands')` and never refreshes or edits the settings. It repaints from the commands notification, reading the current snapshot rather than trusting the event data. Opening the tab with an unreadable snapshot reports `invalid commands topic data`; a repaint with an unreadable snapshot keeps the restrictions the plugin last accepted so no grant looks falsely available, and publishes nothing when none was ever accepted.
- A restricted grant is dimmed with a tooltip of exactly `Disabled application-wide` or `Disabled for agents`. Unknown grants keep the existing `Not a native command` title because the vocabulary check runs first. No visible text or icon is added.

### Client presentation

- Publish a `disabledApplicationCommands` state field containing only the normalized name, aliases, and fixed forms of rows whose effective setting is off, with parent effects already folded in. It carries no saved enabled value, agent-access state, native tool, or parent. Agent-only restrictions are not part of this list.
- Build the projection with a pure helper so `buildStateEvent` stays thin. Subscribe the settings manager's publication to the existing state-dirty event so edits and refreshes reach every client.
- Match the client list with a pure browser-local function: drop one leading `/`, skip input starting with `!`, normalize by trimming, collapsing whitespace, and lowercasing, then return the row whose name, alias, or fixed form is the longest word-boundary match. Prefer the row whose canonical name equals the matched form when two rows tie, so `question ask` and `question approve` stay on their native rows.
- Client gating is presentation only; the server remains authoritative. A stale client can at worst block an enabled shortcut with no notification or open a picker whose line the server then refuses; it can never execute a disabled command.
- Gate command-bar lines once, after classification. A disabled `quit` or `close` line is consumed: no quit confirmation or save guard opens, and the client reports the canonical word (`quit` or `close`) to the server. Every other disabled line returns false so it reaches the server and its refusal output appears in the tab.
- Attribute a consumed quit/close line or a blocked shortcut to the focused tab when the key event is inside one, otherwise to the active tab. If no tab label is known, block or consume the line and skip the report.
- In a shell tab, skip the local `hist` history route and `search transcript` find route when their command is disabled, so the line reaches the server and is refused. A line beginning with `!` and bare `clear` keep their shell routes.
- Gate the five command-backed shortcuts: `ctrl+r` for `hist`, `ctrl+e` for `queue`, `ctrl+a` for `tasks`, `meta+shift+f` for `search`, and `meta+t` for `shell`. Check the command before plugin chord claims and the app opener; when disabled, prevent the browser default, report the canonical command, and consume the key. Leave `ctrl+g`, `meta+p`, `meta+f`, `shift+tab`, and every other chord ungated. A composing key never reports a blocked command, and a held blocked shortcut is reported once: every keydown is prevented and consumed, but the report is sent only when `KeyboardEvent.repeat` is false.
- Add one core `reportBlockedCommand` RPC with `{ text, tab }` and an `ack` reply. It is a report, not a dispatch: ignore a tab that is not open, otherwise re-resolve the text against the current server snapshot and, when disabled, emit the existing `command-disabled` notification. Add no client toast, transcript line, event type, or config field.
- Expose the disabled-command query to plugin bodies through the existing `AppCommandBar` seam rather than a new capability. It is optional and client-only; `TAB_PLUGIN_API_VERSION` stays 3 and no payload schema changes.

### Notifications

- Use a `command-disabled` ambient event with its own notification setting, off by default like existing ambient events. Its camel-case setting is `notifications.events.commandDisabled`, and its alert defaults match the other ambient events: no desktop banner and no sound.
- Disabled-command notifications are attributed to the originating tab and follow the existing focus suppression, feed, and toast behavior. Suppression affects delivery only.
- A refused ACP call returns the same refusal to the agent regardless of notification visibility.
- A blocked shortcut or a consumed command-bar quit/close line is reported to the server, which re-checks its current snapshot and records the same ambient event against the focused or active tab.

## What already exists (reuse, don't rebuild)

| Existing surface | Relevant behavior |
| --- | --- |
| `src/commands/index.ts` `coreCommands` and `commands` | Ordered application command definitions and accepted plugin adapters. |
| `src/plugins/roles/shared.ts` `NATIVE_ACP_COMMANDS`, `src/acp/native-commands.ts` `nativeCommandName`, and `src/acp/tool-table.ts` `createAcpToolTable` | Existing native vocabulary, recognition, and ACP tool dispatch. |
| `src/plugins/models/` and `web/src/plugins/models/` | Models tab declaration, activation, and table implementation. |
| `src/plugins/roles/` and `product/specs/roles.md` | Role command grants, persistence, and editing. |
| `src/plugins/roles/roles-file.ts` `readRolesFile` and `writeRolesFile` | Home/project fallback and safe file-writing precedent. |
| `src/atomic-write.ts` `atomicWriteFile` | Atomic replacement, permission preservation, and cleanup on write failure. |
| `src/plugins/topics.ts` `TOPIC_SOURCES` and `src/plugins/models/activate.ts` `activate` | Host topic and plugin update pattern; the Commands tab is center-only. |
| `src/command/manager.ts` `dispatchLineWithOutput` and `dispatchQueuedLine` | Shared application dispatch and captured replies for plugins and queues. |
| `src/controller/completion.ts` `complete` | Host completion path used by plugin capabilities. |
| `web/src/shared/command-bar/AppCommandBar.tsx` `intercept` and `web/src/shared/app-chords.ts` `APP_CHORDS` | Client command intercepts and global shortcuts needing the same availability state. |
| `src/agent/command-tools.ts` `runGrantedAgentCommand` | Skill-granted agent path also enters the shared dispatcher. |
| `src/notifications/index.ts` `AMBIENT_EVENTS` and `src/config-decode.ts` `stateChange` | Ambient event classification, focus suppression, and independent settings. |
| `web/src/plugins/roles/RoleCommands.tsx` `availableRoleCommands` and `orderedRoleCommands` | Existing role grant picker, ordering, and dimmed unknown-row presentation. |

## Proposed changes

Extend the existing application command registry with canonical command and subcommand metadata, including `help` and accepted bundled plugin commands. Preserve the existing ordered `match`-based owner resolution in `src/resolve.ts` `resolveCommand` and `src/commands/index.ts` `findCommand`; for example, the built-in transcript search and plugin search share a name. Apply the longest fixed-form match only within the resolved owner's metadata, so policy does not reroute a command or change existing aliases. A host-owned service holds effective settings and serves dispatch, ACP, and both tabs. Register its lifecycle with `Managers`; avoid creating an independent registry or a per-tab settings map. Supply an import-free shared contract where browser code needs the data, and keep the wire contract in `src/protocol.ts`. Update the relevant application command, ACP, roles, tab, completion, notification, and keyboard specifications and user-facing help.

Publish the inventory and effective availability through a narrow host topic. Use plugin intents and topic actions for edits, following the Models topic pattern, so both tabs observe the same server-owned settings. Extend `src/plugins/api-topics.ts` and the topic registry, provide an awaited edit result as `src/plugins/models/activate.ts` does for Delete, and update guards and payload schema versions when their shapes change. Only open, activated plugins receive topic notifications; initial payloads must read the current snapshot rather than wait for a notification.

Keep the existing group descriptions in ACP primers and filter the final allow-list to the intersection of role grants and enabled native commands. The group descriptions can therefore mention commands excluded from the allow-list. `src/acp/run-prompt.ts` constructs the tool table and primer for each prompt, so filter at that boundary as well as at session launch and check current settings at execution time.

Route ACP native calls through the ordinary command dispatcher in place of the existing direct-service tool runner. Preserve role-grant checks, current disabled-setting enforcement, and the textual tool responses the ACP loop requires.

The existing `src/commands/browser.ts` `run` invokes the interactive browser path, whereas the ACP path needs the browser service directly; `question` also depends on the invocation's abort signal and `awaitResult`. Adapt the dispatcher and command execution contracts so ACP receives its current browser, database, and question outputs, cancellation, and result timing without bypassing availability. Preserve extraction of recognizable disabled command lines so an existing session receives a refusal instead of silently treating a command as a final answer.

Concurrent edits may each read the same effective file; the last full-file write wins, even if it overwrites an earlier edit. Each successful write publishes its resulting settings. This intentionally allows lost updates under concurrent editing; a future change could serialize edits if that ceiling becomes unacceptable. Use `src/atomic-write.ts` `atomicWriteFile` to prevent partial files, rather than introducing another replacement mechanism.

Move or wrap application commands answered during resolution, such as `help`, so they pass through the same availability check while preserving their existing replies.

Cover `src/resolve.ts` `resolveCommand` and `src/commands.ts` `getOutput`, command-manager direct and captured dispatch, `src/agent/command-tools.ts` `runGrantedAgentCommand`, queues, schedule dispatch, plugin capabilities, and client intercepts. A disabled application command must remain claimed and refused rather than falling through to a shell; the skill-granted agent path must receive the refusal as its result while retaining its separate skill-grant check. Exclude explicitly requested shell execution from command policy. Propagate effective availability to client-side intercepts and shortcut handlers through the shared server state, without duplicating authority in the browser. Filter `src/controller/completion.ts` `complete` and relevant subcommand completers using the same canonical metadata.

Resolve an invocation to the longest applicable declared fixed form of the selected command, respecting existing parsers and aliases, before checking its settings and those of its parents. Canonicalize aliases to the same policy key; do not derive fixed forms from `samples`, which serve the separate priority test and include arguments.

Add `command-disabled` to the notification event union, ambient-event map, formatting, alert defaults, config type/default/decode, and related protocol where necessary. Suppression affects delivery only, never the enforcement check or the ACP return value.

Implement the center-only Commands plugin under `src/plugins/commands/` and `web/src/plugins/commands/`, declaring it in the catalog and literal loader maps. Its command handler routes bare `commands` to the tab and enable/disable forms to the host service. Extend `src/plugins/roles/activate.ts` and the Roles payload to consume the new host topic and show effective restrictions while preserving role grants and picker choices. Keep the plugin API additive and capability-narrow; validate topic actions and plugin intents at their ingress.

Update the user documentation for the Commands tab and for the five ambient notification events, including `commandDisabled` (default off, `Command is disabled: <command>.`, attributed to the originating tab). Update the applicable help pages to match the shipped gating: the `commands` row and section in `help/commands.md`, the `keys` rows for the five command-backed shortcuts and the shell-tab `hist`/`queue`/`search transcript` routes, and the `hist`, `queue`, `tasks`, `theme`, `syntax`, `search`, `close`, and `quit` pages. Leave `Cmd+F` itself ungated on the transcript-search row, and keep the last-tab close path accurate: `Cmd+W`/`Ctrl+W` and the tab-strip close control still open the quit confirmation, and confirming dispatches `quit`, which the server refuses when `quit` is disabled.

## UI design

The Commands tab mirrors the existing Models tab and presents an alphabetical table with an application-wide toggle and, only for native ACP tools, an agent access toggle. The Roles tab displays agent-disabled grants dimmed with a tooltip, including grants added while disabled.

`commands` opens or focuses the singleton in the center, like Roles; it does not dock.
Keep the alphabetically sorted command table horizontal at all pane widths, with horizontal scrolling when narrow.
A metadata bar above the table floats `Editing <path>` or `No commands file in effect` at its left and carries Refresh and the split-tab action at its right, like the Models tab.
Show file problems and refused edits beneath the bar, like Roles. A failed save leaves the last successfully saved toggle state visible.
Disable the affected toggle while its save is pending; leave other controls usable.
Use native checkbox controls for toggles, with browser-provided checked state and Space activation. Add only the requested arrow-key navigation between command rows: Up and Down move focus to the same toggle in the previous or next row, falling back to that row's Enabled toggle if the corresponding toggle is absent; stop at the first and last row.
Skip unavailable toggles, including pending-disabled ones, during arrow navigation and continue to the next focusable matching toggle, using Enabled as a fallback.
The toggle accessible names are `Enabled: <label>` and `Agent access: <label>`.
Use the host's normal tab focus and close behavior; Escape has no Commands-specific action.
Show `No commands` for an empty inventory; the tab is created with a complete payload, so no loading state is needed.
Dim a subcommand disabled by its parent and disable both of its toggles until the parent is enabled, retaining their saved values. Provide the visible or accessible explanation `Disabled by parent command: <parent>.`
Match the Models table's spacing, borders, muted disabled rows, and theme colors, with source and problem lines like Roles.

Client code belongs in a feature directory with decisions in pure modules and hooks and thin components, without imports from other features. Server-owned state remains on the server.

## Tests

- Inventory claim tests (a separate file, so the catalog mock does not disturb module-level rows) cover a declaration claiming `open` contributing no row or alias while the builtin `open` row remains, an accepted declaration dropping only its rejected alias, every core command having a row, exactly one `help` row, and one row per native ACP command. Cache tests cover repeated calls returning the same sorted array. Child-row tests cover parent links, `db sqlite query` parented to `db sqlite`, and `resolveApplicationCommand('tab dock x')` returning the `tab dock` row; manager tests cover disabling `tab dock` leaving `tab focus` and `tab` enabled and disabling `tab` disabling `tab undock`.
- Shared matcher tests cover normalization, word-boundary matching, alias matching, longest-form and canonical-form ranking, and dropped non-matches; a parity test runs `question ask`, `ask reset`, `search transcript`, and `browser goto` through the server resolver and the client matcher and asserts the same row. Domain tests pin the guard sets to the shared arrays and accept every declared kind, tool, and source. Effective-setting tests cover the missing-snapshot, missing-row, and listed-row results.
- Colocated inventory tests cover complete built-in, accepted-plugin, help, and native-ACP rows; canonical spellings and aliases; whitespace/case normalization; fixed forms versus argument text; parent links; native-tool association; deterministic alphabetical ordering; owner-first resolution of the built-in/plugin `search` collision; and the absence of rejected plugin claims.
- Settings tests cover defaults, overrides, missing fields, normalization and textual-order duplicates, malformed entries defaulting enabled and being cleaned by a successful save, malformed top-level files, unknown settings, precedence and exact fallback/refusal messages, preservation of broken files, no-write reads, first-write destination, failed atomic writes, re-read on edit, saved versus effective parent/agent availability, competing writes with last full-file write winning, and successful publications.
- Scanner tests (`decode.test.ts`) decode real file texts: keys with escaped quotes and backslashes; brackets, braces, and commas inside keys and string values; a malformed string value at depth one defaulting enabled; nested objects and arrays not disturbing key tracking; exact duplicates with the last value winning; keys colliding after normalization in both orders; an empty key being malformed; and a non-object top level returning `undefined`. Manager tests also cover trailing-word names refused without a write, an alias with odd case and spacing still editing, the fallback problem surviving an edit, and the `overridden` list (a project file lifting a home disable and a home agent denial, absent when the project keeps the restriction, when no home file exists, or when the home file is the source, and updated after a project-file edit); payload tests cover accepting and rejecting `overridden`.
- Dispatch tests cover every route, including `ask:hello`, `ask-hello`, and `db.sqlite` refused through `dispatchTo`, `dispatchLineWithOutput`, and `executeCommand` while `quit now` stays unrefused, and the fallback name refusing a punctuation-joined line without being used when the row resolves directly: direct execution, normal dispatch, each capture/result contract, resolver ownership, help, aliases, shared owners, parent and child settings, explicit `!` shell escape, queued and scheduled execution after settings change, plugin line dispatch, originating-tab attribution, suppressed notification delivery, and refusal preservation when capture times out or captures nothing. A disabled command must not be rerouted to a competing owner or shell.
- Capture-contract tests prove the refusal happens before effects: a `promptAcp` plugin tab dispatches `ask hello` with a zero capture limit and returns the exact refusal, a structured-result command returns no result, and a normal-capture command settles without advancing the capture timer.
- Completion tests cover first-token names and aliases, disabled hiding including a same-prefix file, merge with file candidates, empty-token, `/`, and path-separator fallback, the prefix guard across `browser`, `send`, `tab`, `files`, `edit`, `schedule`, and `help`, disabled browser child filtering, controller wiring with a real settings manager, and unchanged `!` fallback completion. Help retention is covered with `browser` disabled: `help bro` still offers `browser` while `help` is enabled and offers nothing when `help` is disabled.
- `src/agent/command-tools.test.ts` covers disabled skill-granted commands, retained skill-grant enforcement, and a refusal returned through `dispatchLineInInvocation`.
- ACP tests cover filtered allow-lists, retained group primers, the empty-intersection rule, role grants, disabled refusal before the role refusal, immediate revocation in a running session, disabled command extraction, browser, database, and question output and cancellation through the dispatcher, no capture deadline, the single `acp: true` transcript entry, and suppression of late results.
- Notification tests cover exhaustive event classification, exact message formatting, tab attribution, default-off and explicit opt-in, active-tab suppression, notification-feed self-suppression, default-muted alerts, and ACP refusals returned independently of notification visibility.
- Plugin host and client tests cover topic publication and validation, the synchronous refresh and awaited set action, singleton tab and command forms, the command grammar and exact errors, payload mapping and labels, keyboard navigation and narrow scrolling, save failures and pending states, and live role-grant dimming and tooltip reasons.
- Roles tests cover the restriction mapping, application-wide precedence, parent folding, non-native omission, malformed topic data (a notification with invalid data after a valid open republishes the previous restrictions, and invalid data before any accepted restrictions publishes nothing), payload guard and schema pin, notification repaint, and unchanged picker and grant behavior.
- Topic-action tests cover the awaited-action guard and the disabled result for each awaited and non-awaited action; the manifest and registry tests pin the Commands schema version to 1. Commands tab tests cover the metadata bar, the Refresh intent, the `overridden` note, and the Agent access checkbox staying disabled with the parent note when a parent denies agent access, even if the child's own saved value is already off. Keyboard tests cover a held blocked shortcut sending one report.
- Client tests cover the state projection, disabled-command matching, command-bar gating for consumed quit/close and server-refused lines, shell-local route gating, chord gating before plugin claims, `reportBlockedCommand` request validation and controller behavior, state fixtures, and a settings publication re-broadcasting the state event.
- `src/native-commands/feature.integration.test.ts` exercises the seams with a real settings manager: a topic edit persists, and the topic snapshot, disabled-command projection, and role restriction mapping agree while dispatch, captured dispatch, queued dispatch, and completion refuse or hide the command; re-enabling restores them. Agent access off removes a command from the human projection and the ACP allow-list while leaving it extractable and runnable from the human command bar.
- A hand-edit test pins the read points: a manager constructed with an empty settings file ignores a hand-written disable until `refresh()`, after which the snapshot and projection reflect it.
- The help command table's alphabetical order, 200-character description limit (350 for `files`), and one-page-per-command check stay green with the `commands` page excluded from the compared command names on both sides.
- The pull-request backlog is restored to its documented empty skeleton — introductory comment, blank line, `# pull-request` — when its entries are resolved.

## Out of scope

- Creating, renaming, deleting, or defining custom commands.
- Per-role overrides of the global controls.
- Blocking arbitrary operating-system shell commands or preventing them from accomplishing tasks similar to disabled application commands.
- Direct tab-close gestures that use `closeTab` rather than a command: `Cmd+W`/`Ctrl+W` on a non-last tab, the tab-strip close control, and dock controls. Only command-bar submissions (including the shell-local `hist`/`search transcript` routes) and the command-backed entries in `APP_CHORDS` are gated. `Cmd+W` on the last tab still opens the quit confirmation; confirming dispatches `quit`, so a disabled `quit` is refused there like anywhere else.
- `nav`, Quick Open (`Cmd+P`), editor find (`Cmd+F`), section navigation (`Shift+Tab`), tab navigation (`Ctrl+G`), and plugin-contributed overlay words such as `clip`; none is an application command.
- The shell's `!` escape and bare `clear` route; both stay shell behavior.
- File watching or continuous reload of `commands.json`; hand edits apply at initialization, on the next Commands-tab refresh, or before an edit.
- A new notification event, alert default, config field, client toast, or transcript entry for blocked shortcuts; the existing `command-disabled` ambient event and server delivery path are the only notification surface.
- New native ACP tools or changes to `NATIVE_ACP_COMMANDS`; the autonomous-agent command path is unchanged.
- A `TAB_PLUGIN_API_VERSION` bump, an existing payload schema change beyond the Roles field, or a new plugin capability for the client-only `AppCommandBar` query.
- Adding subcommand completers for commands that have none today; only existing completers are filtered.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually open Commands, change both controls, check the Roles display and a refused human and ACP invocation, re-enable the commands, and verify persistence after reopening.

With an isolated scratch home and project, confirm: `commands` opens or focuses one center tab; rows are alphabetical with `No commands file in effect` and native ACP rows showing both controls; a disabled parent dims its children and retains their saved values; a failed or refused save leaves the last saved state visible; the table scrolls horizontally when narrow; Space toggles and Up/Down navigate with the documented fallbacks. Confirm a disabled ordinary command is refused with `Command is disabled: <command>.`, a disabled `quit` or `close` line is consumed with no confirmation or save guard, a blocked shortcut is reported, and `help commands` still lists disabled commands while completion omits them. Confirm the project override replaces the home file, damaged files are preserved with the documented problem line, and a hand edit applies only after reopening Commands. Verify Roles dims restricted grants with the documented tooltips while keeping them stored and pickable, and confirm an ACP session refuses a disabled or agent-denied command on its next emitted call. ACP verification requires a configured harness and model.
