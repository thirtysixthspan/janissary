# Native application commands

**Complexity: 9/10** — command metadata, persistence, client and server enforcement, ACP routing, a plugin topic, and two tab surfaces span the application.

Maintain native application commands in a registry and expose their availability in a Commands tab. This gives users control over application-wide command availability and which commands agents can call through ACP.

## Design decisions

- List application commands and subcommands alphabetically in a table with application-wide availability controls. Show an agent access toggle only for commands available as native ACP tools. All commands are enabled by default.
- Include all built-in application commands and identifiable subcommands, including the nine native ACP commands, as well as bundled plugin commands.
- Give named, fixed application subcommand forms their own rows. Filenames, SQL text, and other user-supplied values are arguments, not separate rows.
- Application-wide disabling blocks dispatch through every path, including command bars, scripts, schedules, plugins, and ACP.
- Also block client-side command-bar pickers and equivalent keyboard shortcuts for a disabled command.
- A blocked keyboard shortcut reports `Command is disabled: <command>.` through notifications.
- A disabled parent blocks all its subcommands. A subcommand can also be disabled independently when its parent is enabled.
- Disabling a parent leaves descendant toggles unchanged while showing that descendants are effectively disabled by the parent.
- Agent access is a permission setting, not a way to expose new ACP tools: only commands already exposed as native ACP tools are available to agents.
- Store registry configuration in `~/.janissary/commands.json`, with a project override at `.janissary/commands.json`.
- When the project file exists, it replaces the home file entirely, as with roles configuration.
- Missing command or toggle settings default to enabled, including for newly introduced commands and in a project override.
- `commands.json` is a JSON object keyed by canonical command name. Each value has optional boolean `enabled` and `agentAccess` fields; omitted fields default to true.
- Match command names case-insensitively, trim surrounding whitespace, and collapse repeated spaces. Display and save canonical spelling.
- If multiple file keys normalize to the same command name, use the last entry and remove duplicates when saving.
- Ignore malformed individual entries, use enabled defaults for them, and permit a subsequent save to remove them.
- Remove settings for unknown commands when saving `commands.json`.
- Follow the roles configuration failure behavior: an unusable project file falls back to the home file, then defaults; report the problem, preserve damaged files, and refuse edits to an unusable effective file.
- File fallback messages follow Roles wording: `commands.json <problem> at <path> — showing the <home|project> commands file.` or `commands.json <problem> at <path> — showing default commands.`
- An edit of an unusable effective file is refused with `commands.json at <path> is unusable — fix the file before editing commands.`
- If neither file exists, the first toggle change creates `~/.janissary/commands.json`; when a valid project override exists, edits go to that file instead.
- Save each toggle change immediately, applying and publishing it only after the write succeeds, as the Roles tab does.
- Re-read configuration when the Commands tab opens and before each toggle edit. Apply hand edits at those points; do not continuously watch the file.
- The `commands` command can itself be disabled. If its tab is closed afterward, re-enable the command by editing the effective `commands.json` file.
- Support `commands enable|disable [agent|global] <command>` in addition to opening the tab. Omitted selector means `global`; command names may contain spaces. Successful changes and already-set values are silent.
- An agent-setting request for a command that is not a native ACP tool is refused with `Not a native ACP command: <command>.` and changes nothing.
- Malformed syntax returns `Usage: commands [enable|disable [agent|global] <command>].` An unknown name returns `Unknown application command: <command>.`
- The command-line form can save a subcommand setting while its parent is disabled; the subcommand remains effectively disabled until its parent is enabled.
- A failed configuration write leaves the effective state unchanged and returns `Could not write commands.json at <path>.`.
- The command-line form re-reads configuration before saving and uses the same effective file, save-before-apply behavior, and damaged-file protections as the tab.
- Refuse disabled commands called by agents and provide agents only enabled commands at launch. Roles may still grant disabled commands; show those grants dimmed with an explanatory tooltip.
- Enforce changes immediately on every agent call. Newly launched ACP sessions receive the updated command list; existing sessions may retain the list they received at launch.
- An invocation already running when its command is disabled may finish; subsequent invocations are refused.
- Check queued and scheduled commands at dispatch time; refuse a command disabled before it runs with the normal disabled-command notification.
- Keep disabled commands in help, but hide them from command completion.
- Label the toggles `Agent access` and `Enabled`. A disabled role grant's tooltip reads `Disabled for agents`; a refused agent call reads `Command is disabled: <command>.`.
- Disabled-command refusals are reported through notifications. A refused ACP call also returns the failure to the agent. Usage, unknown-name, save, and other existing command errors keep their normal command replies.
- When an ACP command is both disabled and not granted to the role, report the disabled-command refusal first.
- Attribute each disabled-command notification to the originating tab and use an ambient event, so focus suppression and notification settings can hide it. Eligible events use the existing feed and toast behavior.
- Use a `command-disabled` ambient event with its own notification setting, off by default like existing ambient events.
- A role grant disabled application-wide is dimmed with the tooltip `Disabled application-wide`, even when its agent access toggle is on; agent calls are refused.
- When both settings disable a role grant, the tooltip is `Disabled application-wide`.

## What already exists (reuse, don't rebuild)

| Existing surface | Relevant behavior |
| --- | --- |
| `src/commands/index.ts` | Registry of application command definitions. |
| `src/acp/native-commands.ts` and `src/acp/tool-table.ts` | Native ACP command vocabulary and tool dispatch. |
| `src/plugins/models/` and `web/src/plugins/models/` | Models tab declaration, activation, and table implementation. |
| `src/plugins/roles/` and `product/specs/roles.md` | Role command grants, persistence, and editing. |
| `src/plugins/roles/roles-file.ts:179` `readRolesFile` and `:218` `writeRolesFile` | Home/project fallback and safe file-writing precedent. |
| `src/atomic-write.ts` `atomicWriteFile` | Atomic replacement, permission preservation, and cleanup on write failure. |
| `src/plugins/topics.ts:18` `TOPIC_SOURCES` and `src/plugins/models/activate.ts` `defineDockableList` | Host topic and plugin update pattern; the Commands tab is center-only. |
| `src/command/manager.ts` `dispatchLineWithOutput` and `dispatchQueuedLine` | Shared application dispatch and captured replies for plugins and queues. |
| `src/controller/completion.ts:9` `complete` | Host completion path used by plugin capabilities. |
| `web/src/shared/command-bar/AppCommandBar.test.tsx` `intercept` and `web/src/shared/app-chords.ts` | Client command intercepts and global shortcuts needing the same availability state. |

## Proposed changes

Extend the existing application command registry with canonical command and subcommand metadata, including `help` and accepted bundled plugin commands. A host-owned service holds effective settings and serves dispatch, ACP, and both tabs. Register its lifecycle with `Managers`; avoid creating an independent registry or a per-tab settings map. Supply an import-free shared contract where browser code needs the data, and keep the wire contract in `src/protocol.ts`. Update the relevant application command, ACP, roles, tab, completion, and keyboard specifications and user-facing help.

Publish the inventory and effective availability through a narrow host topic. Use plugin intents and topic actions for edits, following the Models topic pattern, so both tabs observe the same server-owned settings.

Keep the existing group descriptions in ACP primers and filter the final allow-list to the intersection of role grants and enabled native commands. The group descriptions can therefore mention commands excluded from the allow-list.

Route ACP native calls through the ordinary command dispatcher in place of the existing direct-service tool runner. Preserve role-grant checks, current disabled-setting enforcement, and the textual tool responses the ACP loop requires.

The existing `src/commands/browser.ts` `run` invokes the interactive browser path, whereas `src/acp/tool-table.ts` calls the browser service directly; `question` also depends on the invocation's abort signal and `awaitResult`. Adapt the dispatcher and command execution contracts so ACP receives its current browser, database, and question outputs, cancellation, and result timing without bypassing availability. Preserve extraction of recognizable disabled command lines so an existing session receives a refusal instead of silently treating a command as a final answer.

Concurrent edits may each read the same effective file; the last full-file write wins, even if it overwrites an earlier edit. Each successful write publishes its resulting settings. This intentionally allows lost updates under concurrent editing; a future change could serialize edits if that ceiling becomes unacceptable. Use `src/atomic-write.ts` `atomicWriteFile` to prevent partial files, rather than introducing another replacement mechanism.

Move or wrap application commands answered during resolution, such as `help`, so they pass through the same availability check while preserving their existing replies.

Cover `src/resolve.ts` and `src/commands.ts` `getOutput`, command-manager direct and captured dispatch, queues, schedule dispatch, plugin capabilities, and client intercepts. A disabled application command must remain claimed and refused rather than falling through to a shell. Exclude explicitly requested shell execution from command policy. Propagate effective availability to client-side intercepts and shortcut handlers through the shared server state, without duplicating authority in the browser. Filter `src/controller/completion.ts` and relevant subcommand completers using the same canonical metadata.

Resolve an invocation to the longest applicable declared fixed command form, respecting existing parsers and aliases, before checking its settings and those of its parents.

Implement the center-only Commands plugin under `src/plugins/commands/` and `web/src/plugins/commands/`, declaring it in the catalog and literal loader maps. Its command handler routes bare `commands` to the tab and enable/disable forms to the host service. Extend `src/plugins/roles/activate.ts` and the Roles payload to consume the new host topic and show effective restrictions while preserving role grants and picker choices. Keep the plugin API additive and capability-narrow; validate topic actions and plugin intents at their ingress.

## UI design

The Commands tab mirrors the existing Models tab and presents an alphabetical table with an application-wide toggle and, only for native ACP tools, an agent access toggle. The Roles tab displays agent-disabled grants dimmed with a tooltip, including grants added while disabled.

`commands` opens or focuses the singleton in the center, like Roles; it does not dock.
Keep the alphabetically sorted command table horizontal at all pane widths, with horizontal scrolling when narrow.
Above the table, show `Editing <path>` for the effective file or `No commands file in effect` when using defaults, like Roles.
Show file problems and refused edits beneath the source line, like Roles. A failed save leaves the last successfully saved toggle state visible.
Disable the affected toggle while its save is pending; leave other controls usable.
Provide standard keyboard-accessible toggles and arrow-key navigation between command rows. Up and Down move focus to the same toggle in the previous or next row, falling back to that row's Enabled toggle if the corresponding toggle is absent; stop at the first and last row.
Skip unavailable toggles during arrow navigation and continue to the next focusable matching toggle, using Enabled as a fallback.
The toggle accessible names are `Enabled: <command>` and `Agent access: <command>`; expose the checked state and support Space to toggle.
Use the host's normal tab focus and close behavior; Escape has no Commands-specific action.
Show `No commands` for an empty inventory and `Loading commands…` while loading.
Dim a subcommand disabled by its parent and disable both of its toggles until the parent is enabled, retaining their saved values. Provide the visible or accessible explanation `Disabled by parent command: <parent>.`
Match the Models table's spacing, borders, muted disabled rows, and theme colors, with source and problem lines like Roles.

Client code belongs in a feature directory with decisions in pure modules and hooks and thin components, without imports from other features. Server-owned state remains on the server.

## Tests

- Colocated service tests cover defaults, overrides, normalization, duplicates, invalid entries, fallback, file writes and failures, and competing edits.
- Command and resolver tests cover every dispatch route, parent and subcommand settings, aliases, help, explicit shell escape, completion, and scheduled or queued execution.
- ACP tests cover filtered allow-lists, retained primer descriptions, role grants, immediate revocation in a running session, disabled command extraction and refusal, and browser, database, and question output and cancellation through the dispatcher.
- Notification tests cover attribution, ambient-event defaults and suppression, and ACP refusals returned to the agent independently of notification visibility.
- Plugin host and client tests cover topic publication and validation, singleton tab and command forms, keyboard navigation and narrow scrolling, save failures and pending states, and live role-grant dimming and tooltip reasons.

## Out of scope

- Creating, renaming, deleting, or defining custom commands.
- Per-role overrides of the global controls.
- Blocking arbitrary operating-system shell commands or preventing them from accomplishing tasks similar to disabled application commands.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually open Commands, change both controls, check the Roles display and a refused human and ACP invocation, re-enable the commands, and verify persistence after reopening.
