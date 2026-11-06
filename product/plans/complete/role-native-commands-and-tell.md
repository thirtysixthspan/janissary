# Role native commands and the `tell` command

**Complexity: 7/10** — two concurrent ACP conversations per tab rekey session, runtime, record, and transcript-entry state across about twenty call sites, on top of a roles file field, two intents, a new UI section, and two new commands.

Feature: give each role an explicit allowlist of native ACP commands, show and edit the grants beside its model entries, and add `tell` as an instruction-giving counterpart to `ask` with its own role and conversation.

Core ACP prompts receive only the native commands granted to their role. `ask` and `tell` use independent sessions, records, prompt state, and transcript entries on the same tab. Role-qualified connection identities make each conversation addressable in the live list and retained history.

## Design decisions

### Native commands

- The ordered `NATIVE_ACP_COMMANDS` tuple lives in the import-free roles contract at `src/plugins/roles/shared.ts`. `src/acp/native-commands.ts` supplies command membership, owning-tool lookup, and canonical command-prefix matching. The nine values are `db sqlite create`, `db sqlite delete`, `db sqlite query`, `db sqlite list`, `browser goto`, `browser content`, `browser eval`, `question ask`, and `question approve`.
- A role stores its commands as a `commands` array after `description` and `entries` in `roles.json`. The in-memory role contract requires a string array. A missing field decodes to an empty grant; a non-array or any non-string member drops the malformed role. Unknown strings and duplicates from hand-written files are preserved. Removing a command removes every copy.
- A granted subcommand accepts its existing trailing arguments; grants do not restrict database, URL, or SQL values. Unknown command strings remain visible in the roles tab as unavailable, but never authorize a tool.

### Default roles

- The default `tell` role follows `ask` and has the same three model entries. Default `ask` grants `db sqlite list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, and `question approve`; default `tell` grants all nine commands; the other five roles grant none. Defaults are written when the roles tab creates a new file. ACP reads do not create a roles file.
- If a role is absent from the effective roles file, ACP uses its built-in defaults. If the role exists but has no commands, it has no grants, even when its model entries fall back to the built-in entries. Settings are read once per prompt; edits apply to the next prompt and do not change the policy used by a running prompt or its retries.
- The roles plugin schema is version 3. The connections payload schema is version 2 because a live tab-scoped `AcpRef` requires a role; retained record roles remain optional so older history without role metadata stays valid. The shell payload schema is version 5, and its lazy client registration advertises the matching version.

### Granting commands to a session

- Each core prompt uses role `ask` for the `ask` command and plugin `promptAcp`, `promptAcpResult`, and `startAcp` calls; `tell` uses role `tell`. Plugin capability calls remain ask-default.
- A tool with no grant for its owner is omitted from the table, so its primer is absent and its command lines are not extracted. Included tools retain their primers and recognizers, followed by `Only these commands are allowed: <granted commands, comma-separated>.` in catalog order. A role with no recognized grants receives no tool table or tool primer. The tab-wide `withoutTools` option still removes tools for either role.
- A recognized command owned by an included tool but not granted to the role returns `Command not allowed for role "<role>": <subcommand>.` as a normal tool result; it is not executed and the step is recorded and counted toward the eight-step limit. Unknown commands and commands from omitted tool owners are not extracted, and cannot fall through to the database runner.

### The `tell` command

- `tell <prompt>` follows the `ask` shell behavior: the exact typed line is echoed, the prompt runs in the background, and one rendered Markdown reply settles beneath that line. Bare `tell` prints `Usage: tell <prompt>.`.
- The tell primer adds `The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.` after any tool primer and before the Markdown instruction. Ask receives no tell instruction.
- Tell uses the tell role's model fallback and grants. No enabled tell model reports `ACP: the tell role lists no models.`; exhausted multi-model fallback reports `ACP: every model in the tell role failed.` with one failure line per attempt. The existing inter-model fallback notice is unchanged. Tell is available on local and remote supported shell tabs; harness tabs have neither ask nor tell.

### Two conversations per tab

- A tab owns one ask and one tell session. Each has its own model, history, pending prompt, durable record, and connection identity. A second prompt is refused only when that same role already has a prompt running; ask and tell can run concurrently.
- Each prompt tracks the running transcript entries it appended, including immutable replacements during streaming, so updates and settlement affect only that prompt's entries. Each ACP prompt and shell command owns its busy token. The tab stays busy until all overlapping shell and ACP work releases its token. Remote process termination clears all busy owners; a later release of a cleared token is harmless.
- Role-specific cancellation, reset, and close affect only that role. `AcpSessionManager.closeTab`, `closeAll`, and `dispose` close every role session. Closing a tab, shutting down, plugin teardown, or losing a remote tab's shared transport closes both. Remote ask and tell sessions use distinct session ids over the existing shared transport.

### Connection names

- Live core ACP connections use `acp:<role>:<provider/model>`. Retained ACP record names and connection-tab titles use `acp:<role>:<tab name>` when role metadata exists. Old role-less retained records keep their existing `acp:<tab name>` name and remain valid.
- A live tab-scoped ACP reference requires its role. Plugin capabilities that refer to their tab's core ACP session explicitly use ask. `acp:<model>` lookup remains ask-default; `acp:ask:<model>` and `acp:tell:<model>` select their matching session.
- `connections close acp:tell` and `acp:tell:<model>` close tell; `acp:ask`, `acp:ask:<model>`, and unmatched ACP ids close ask. Editor-persona and monitor routing retains precedence. A connection record's **Close session** and cancel actions resolve the record's role, treating legacy role-less records as ask, and verify that the owner tab still holds that exact record.
- A tell tab-scoped reference opens the tell record while its transcript snapshot remains the whole shared tab transcript. `TabView.acp` continues to report the ask model.

## What already exists (reuse, don't rebuild)

| Concern | Existing behavior | Reuse |
| --- | --- | --- |
| Native tool definitions and recognizers | `src/acp/tool-table.ts`, `src/database/primer.ts`, `src/browser/command.ts`, `src/question-command.ts` | Filter the existing ordered tools and preserve their runners and grammar. |
| Role-file decoding and defaults | `src/plugins/roles/roles-file.ts`, `src/plugins/roles/ordered-json.ts` | Keep the existing precedence, serialized writes, malformed-role reporting, and ordered persistence. |
| Role edits and plugin boundary | `src/plugins/roles/shared.ts`, `src/plugins/roles/activate.ts`, `src/plugins/roles/role-edits.ts` | Carry the vocabulary as data and use narrow add/remove intents through the existing write-then-publish path. |
| Ask model fallback and prompt orchestration | `src/acp/ask-role.ts`, `src/acp/manager.ts`, `src/acp/run-prompt.ts` | Resolve named role settings and reuse the core prompt and retry path. |
| ACP session and record ownership | `src/acp/session-manager.ts`, `src/acp/record-feed.ts`, `src/acp-records/` | Key sessions, runtime state, and records by the canonical ask/tell role while retaining legacy records. |
| Transcript update and tab busy state | `src/tab/transcript/events.ts`, `src/tab/runtime-operations.ts`, `src/shell/manager.ts` | Reuse immutable-entry tracking and busy projection with prompt/shell owner tokens. |
| Remote ACP lifecycle | `src/remote/protocol-frames.ts`, `src/remote/acp-session.ts`, `src/remote/channel/acp.ts` | Keep per-session ids on the existing shared remote channel. |
| Connection list, lookup, and close | `src/connection/catalog.ts`, `src/connection/close.ts`, `src/plugins/connections/lookup.ts`, `src/plugins/connections/shared.ts` | Keep list, lookup, popup refs, retained names, and close routing on the existing connection contracts. |
| Roles UI | `web/src/plugins/roles/` | Keep client code inside the feature directory and use the server-supplied vocabulary. |

## Proposed changes

### Implementation decisions

- Define the native command tuple in the roles shared contract and add the pure server helper for membership, tool ownership, and command-prefix matching. Persist role grants, add the default tell role, and register guarded command edit intents. Roles schema version 3 is declared on the server and in the lazy client registry.
- Resolve each prompt's named role settings once, filter the ACP tool table, append the allowlist instruction, and return an exact refusal for known but ungranted commands. Preserve model fallback, tool extraction, the eight-step limit, and `withoutTools` behavior.
- Use role-keyed ACP session and runtime state, optional persisted record roles, and per-prompt running-entry identity. Preserve ask defaults for existing plugin APIs. Add busy-owner tokens for ACP prompts and shell commands, and clear all owners when a remote process terminates.
- Add `tell` and `tell reset`, with tell-specific prompt instruction, model errors, reset messages, and shell availability. Keep ask and tell sessions independent and close both at tab-wide lifecycle boundaries.
- Add role to tab-scoped `AcpRef` and live/retained connection names; route lookup, record open/cancel/close, and `connections close` by role while preserving ask-default legacy lookup and role-less retained records. Advertise connections payload schema version 2 and shell payload version 5 with matching client registrations.

### Changes by module

- `src/plugins/roles/shared.ts`, `roles-file.ts`, `ordered-json.ts`, `role-edits.ts`, and `activate.ts`: ordered command vocabulary, role command field, defaults, malformed-role handling, guarded intents, and serialized write/publish behavior.
- `src/acp/native-commands.ts`, `ask-role.ts`, `tool-table.ts`, `manager.ts`, and `run-prompt.ts`: command classification, named-role snapshots, filtered tool tables, refusals, fallback, and tell instruction.
- `src/acp/role.ts`, `role-state.ts`, `prompt-state.ts`, `session-manager.ts`, `record-feed.ts`, `response.ts`, `src/acp-records/`, and `src/tab/types.ts`: canonical role identity, independent role runtime/session/record state, and legacy role-less record support.
- `src/tab/transcript/events.ts`, `src/tab/runtime-operations.ts`, `src/tab/manager.ts`, `src/shell/manager.ts`, and `src/remote/attach.ts`: prompt-specific running-entry updates, busy-owner projection, shell/ACP owner release, and remote termination clearing.
- `src/commands/tell.ts`, `tell-reset.ts`, `src/commands/index.ts`, and `src/command/resolve-in-tab.ts`: tell command and reset registration and supported shell/remote availability.
- `src/connection/catalog.ts`, `close.ts`, `src/protocol/tab.ts`, `src/protocol/connections.ts`, `src/plugins/connections/`, and `src/controller/connection-records.ts`: role-qualified refs/names, schema versions, lookup, record actions, and close routing.
- `web/src/plugins/roles/`: server-vocabulary-driven Models and Commands sections, command picker, pure ordering/options helpers, and shared picker-focus hook.

### Implementation order

1. Add the vocabulary, role persistence/defaults/intents, and roles UI.
2. Apply role grants to the ACP tool loop and preserve each prompt's role settings snapshot across model fallback.
3. Key session/record state by ask/tell role, isolate transcript entries, and track shell/ACP busy owners through overlapping work and remote termination.
4. Add `tell` and `tell reset`, then role-aware live/retained connection identity, refs, lookup, and close actions.
5. Reconcile specs, command help, user documentation, and run the isolated integration flow.

### Specs and docs

- `product/specs/roles.md` describes command persistence, validation, defaults, editor sections, ordering, and edit behavior. `product/specs/acp.md` describes per-prompt grants, ask/tell behavior, concurrent sessions, busy state, reset, and tool refusal. `product/specs/connection.md` and `product/specs/connections-tab.md` describe role-qualified names, legacy lookup and records, and role-specific lifecycle actions. `product/specs/tabs.md` states that busy remains active through overlapping shell and ACP work.
- The command reference sources document ask/tell grants and reset, command ordering, role-aware connection names and closing, and role editing. The two user pages explain choosing ask or tell and granting commands in task-first language.

## UI design

### Layout

- Each role card has stacked **Models** and **Commands** sections. The model section uses **Add model** and keeps existing model rows, effort controls, and drag behavior. The command section shows command text and a remove button; it has no harness column, effort control, or drag behavior.
- Command rows follow native vocabulary order, with duplicate copies adjacent; unknown stored strings follow in stored order, dimmed and titled `Not a native command`.

### Interaction

- **Add command** opens a picker of unlisted native commands in vocabulary order. Add and Cancel close the picker. Removing a row removes every stored copy of that command. Duplicate edits from another client are no-ops; the next publication remains the source of truth.
- Both model and command pickers share focus behavior. A picker focuses its first dropdown when opened, cancels on Escape, and restores focus to its add button when closed.

### States

- The lists display `No models` or `No commands` when empty. **Add command** disappears when all nine distinct native commands are present.
- If a publication makes a selected command unavailable, the picker clears the selection; if no commands remain available, it closes. If a publication removes the focused **Add command** button, focus moves to the Commands heading. Command text wraps at narrow pane widths without hiding the remove control.

### Keyboard and accessibility

- No new key bindings are added. The command dropdown is named `Command to add to role <name>`, command removal controls are named `Remove <command>`, and the section lists are named `Models of role <name>` and `Commands of role <name>`.

### Code organization

- Client code stays inside `web/src/plugins/roles/`: `RoleCard`, `RoleModels`, `RoleCommands`, and `CommandPicker` keep components thin, `role-commands.ts` owns pure ordering/options rules, and `useRolePickerFocus.ts` shares picker focus behavior. The client renders the server vocabulary and sends add/remove intents; it does not duplicate the command catalog.

## Tests

- Role catalog, persistence, schema, and intents: `src/acp/native-commands.test.ts`, `src/plugins/roles/shared.test.ts`, `roles-file.test.ts`, `ordered-json.test.ts`, `activate.test.ts`, `src/plugins/shell/shared.test.ts`, `src/plugins/connections/shared.test.ts`, and `web/src/plugins/registry.test.tsx` cover the vocabulary, malformed and unknown grants, duplicates, defaults, no-op edits, schema versions, and client/server parity.
- Role editor: `web/src/plugins/roles/role-commands.test.ts`, `RolesTab.test.tsx`, and `roles-dnd.test.tsx` cover ordering, picker options, unknown and duplicate rows, accessible names, focus, publication races, and unchanged model behavior.
- Authorization and orchestration: `src/acp/ask-role.test.ts`, `native-commands.test.ts`, `tool-table.test.ts`, `manager.test.ts`, `manager-fallback.test.ts`, `plugin-session.test.ts`, and `run-prompt.test.ts` cover per-prompt role snapshots, grants, tool omission, refusals, ask/tell fallback, prompt wording, concurrency, cancellation, and the tool-step cap.
- Session records and cleanup: `src/acp/record-feed.test.ts`, `src/acp-records/store.test.ts`, `src/acp-records/manager.test.ts`, `src/acp/manager.test.ts`, `src/plugins/acp-records.test.ts`, and `src/remote/attach.test.ts` cover role round trips, legacy role-less records, validation against `ACP_ROLES`, close-all behavior, prompt-local transcript updates, busy owners, and remote termination clearing.
- Commands and connection identity: `src/commands/tell.test.ts`, `src/commands/tell-reset.test.ts`, `src/command/resolve-in-tab.test.ts`, `src/commands.test.ts`, `src/connection/catalog.test.ts`, `src/connection/close.test.ts`, `src/plugins/connections/shared.test.ts`, `src/plugins/connections/lookup.test.ts`, `src/plugins/connections-topic-rows.test.ts`, `src/plugins/connections-topic.test.ts`, `src/controller/connection-records.test.ts`, `src/client-params/core.test.ts`, and `web/src/plugins/PluginBody.test.tsx` cover command availability, role-specific routing, ask-default legacy lookup, required live-ref roles, schema version 2, retained records, and tell-only reset/close behavior. The existing plugin-body test continues to cover generic schema mismatch rejection.
- Shell refusal output: `src/acp/manager-fallback.test.ts` covers one background reply for bare ask/tell usage, unavailable tell models, same-role overlap, and a still-connecting remote tell. It also confirms direct `promptResult` callers retain the manager's default transcript result.
- Transcript and busy state: `src/tab/transcript/events.test.ts`, `src/tab/runtime-operations.test.ts`, `src/acp/record-feed.test.ts`, and `src/remote/attach.test.ts` cover entry identity, shell/ACP completion orders, simultaneous busy owners, and terminal clearing.
- The command registry suite `src/commands.test.ts` covers command ordering and source help links.

## Out of scope

- Per-database, per-URL, or per-SQL-statement restrictions on a listed subcommand, and arbitrary shell commands as native commands.
- Restricting harness tabs by role or adding `tell` to harness tabs.
- Migrating existing role files; an existing ask role with no `commands` field grants no native commands.
- Changing monitor, conversation, editor-persona, or agent session policy, or changing the shared ACP transcript snapshot and visible record title.
- Changing remote ACP transport frames or adding new protocol messages; existing per-session ids carry the two roles.

## Verification

- Diff-scoped lint, typecheck, and related server/web tests passed during implementation. The final rebase hard gate passed typecheck, lint, and 15,113 tests with one skipped; GitHub lint, tests, and TypeScript checks passed on the rebased head.
- Shell `ask` and `tell` synchronous refusals produce one background reply while direct ACP callers retain transcript output. The repair passed `check-diff`; 51 directly related tests and the 853-test diff-scoped server suite passed. The PR title is `feat(acp): add role-native commands and tell`.
- The isolated browser flow used a fresh scratch home and project with no roles file. It confirmed all seven role cards show **Models** and **Commands**, ask displays six grants, tell displays all nine and no **Add command**, and removing `db sqlite query` persists to the scratch roles file. The browser console had no errors. With no active session, `tell reset` returned `No active ACP tell session to reset.`.
- Provider-dependent prompt execution, ask/tell overlap, live role-qualified names, active tell reset, and tell-specific close were not manually exercised because the isolated home had no configured or signed-in ACP provider. The implementation's unit and integration tests cover those behaviors; no manual pass is claimed for the provider-dependent steps.
- Confirm help ordering and links with `src/commands.test.ts`; run `$janissary/scripts/run.mjs check-diff` during development. Do not run `npm run check`.
