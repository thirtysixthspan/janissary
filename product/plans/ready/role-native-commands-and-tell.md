# Role native commands and the `tell` command

**Complexity: 7/10** — two concurrent ACP conversations per tab rekey session, runtime, record, and transcript-entry state across about twenty call sites, on top of a roles file field, two intents, a new UI section, and two new commands.

Feature: a role should have access to a set of native sql commands that can be called. the available commands are listed in acp-tools. update the roles UI so that each role has two sections, one for models and one for commands. add a tell command that works just like the ask command but is for instructing the model to do something. add a tell role mirroring the defaults for the ask role. when an acp connection is established, it should have access to use the native commands listed in the associated role.

Today every core ACP session — the one behind `ask` and every plugin's `promptAcp` — gets the whole host tool table (browser, question, database) unless a plugin opted out with `withoutTools`. A role only says which models to try. This feature makes a role also say which native host subcommands its sessions may run, shows that in the roles tab, and adds `tell`, an instruction-giving twin of `ask` with its own `tell` role and its own conversation. The point is to keep a question-answering session from changing things while letting an instructed session act.

## Design decisions

### Native commands

- The native command vocabulary is the subcommands of the ACP tool table in `src/acp/tool-table.ts` (formerly `src/acp-tools.ts`, the file the feature text names). There are nine, written in the full grammar the model types, in this order: `db sqlite create`, `db sqlite delete`, `db sqlite query`, `db sqlite list`, `browser goto`, `browser content`, `browser eval`, `question ask`, `question approve`.
- A role lists its commands as a `commands` array of those strings in `roles.json`, beside `description` and `entries`. A listed subcommand runs with any arguments; nothing narrows by database, URL, or SQL statement.
- A role with no `commands` key may run no native commands. An explicit empty list means the same. Existing files therefore lose tools on their `ask` role until the user adds commands — an intentional break, not a migration.
- A hand-written command that is not one of the nine stays on the card and in the file, dimmed and titled `Not a native command`, and no session can run it. Nothing about it is stored; the card dims it by comparing against the vocabulary the payload carries.
- A `commands` value that is not a list of strings makes the whole role malformed: the role is dropped and counted in the existing `roles.json dropped N malformed roles or entries at <path> — showing the rest of this file.` line, and edits are refused until the file is fixed, as for any other malformed role. Duplicate strings in a hand-written list are kept as written.

### Default roles

- A `tell` role is added to the default roles directly after `ask`, with description `When you tell a model to carry out a task via ACP.` and the same three entries as the default `ask` role: `opencode` `opencode-go/deepseek-v4.1-flash` at `medium`, `claude` `claude-haiku-4-5` at `high`, `codex` `gpt-6-luna` at `high`.
- The default `ask` role lists `db sqlite list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, `question approve`. The default `tell` role lists all nine. The other five default roles list none.
- Defaults are written only when the roles tab creates a new file (existing behavior). Reading roles for ACP never creates a file.
- When the roles in effect have no `ask` (or `tell`) role at all, ACP uses that role's built-in default models and default commands. When the role exists but its model list is empty, models fall back to the defaults (existing behavior) and commands stay whatever the role itself lists — none when it has no `commands` key.

### Granting commands to a session

- Each core ACP prompt runs under a role: `ask` for the `ask` command and for every plugin `promptAcp`/`promptAcpResult`/`startAcp`, `tell` for the `tell` command.
- The role's commands are read fresh for every prompt, like its models. An edit while a conversation is open applies to that conversation's next prompt; its history is kept.
- A tool none of whose subcommands the role lists is left out of the tool table, so it contributes no primer text and none of its lines are recognized. A tool with at least one listed subcommand keeps its existing primer unchanged, and the tool primer ends with one line naming exactly what may run: `Only these commands are allowed: <listed subcommands, comma-separated>.` A role with no commands gets no tool primer at all.
- A reply line that is a command of a known tool but a subcommand the role does not list is not run. The tool step returns `Command not allowed for role "<role>": <subcommand>.` to the model, so it can adjust, and the step is recorded in the transcript and connection tab like any other tool step and counts toward the eight-step cap.
- A tab whose session a plugin started with `withoutTools` still builds no tool table at all, for both roles (existing behavior, `acp.md` § Autonomous tool loop).

### The `tell` command

- `tell <prompt>` behaves like `ask <prompt>`: a core-rendered background reply in the shell, the same placement and echo rules, the same model fallback through the role's entries, the same cancellation, and the same settlement lines.
- Its primer adds one line after the tool primer: `The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.` `ask` gets no such line.
- Bare `tell` prints `Usage: tell <prompt>.`. A `tell` role with no enabled entries refuses with `ACP: the tell role lists no models.`. When more than one entry was tried and all failed, the reply is `ACP: every model in the tell role failed.` followed by one `- <harness> <model>: <error>` line per attempt. The fallback notice is unchanged: `ACP: <harness> <model> failed — trying <harness> <model>.`.
- `tell` is available wherever `ask` is, including remote shell tabs. Harness tabs get neither.

### Two conversations per tab

- A tab holds one `ask` conversation and one `tell` conversation. Each has its own session, model, history, durable record, and identity.
- They run independently: each refuses only its own second prompt with `ACP: a prompt is already running.`, so an `ask` can run while a `tell` is running on the same tab.
- `tell reset` closes only the tell conversation and reports `ACP tell session reset — next tell prompt will start fresh.`, or `No active ACP tell session to reset.`. `ask reset` keeps its wording and closes only the ask conversation.
- Tab close, plugin failure, shutdown, and remote transport loss close both.

### Connection names

- A live ACP connection id carries its role: `acp:<role>:<provider/model>`, e.g. `acp:ask:opencode-go/deepseek-v4.1-flash` and `acp:tell:claude-haiku-4-5`. This applies to `connections list`, the tab's connections popup, and the `Closed connection …` report. Plugin sessions read `acp:ask:…`.
- A retained record's name and its connection tab's title carry the role: `acp:<role>:<tab name>`. Name lookup matches the new form. Records made before this change keep the name they stored. The record title (`ACP: <first line of its first prompt>`) is unchanged.
- `connections close acp:<name>`: `acp:tell` or `acp:tell:<…>` closes the tell session, `acp:ask` or `acp:ask:<…>` closes the ask session, and any other name closes the ask session, as today's catch-all does (the still-connecting case). The connection tab's **Close session** closes the session that record belongs to.

## What already exists (reuse, don't rebuild)

| What | Where | Reuse |
| --- | --- | --- |
| ACP tool table (browser, question, database) | `src/acp/tool-table.ts` (`createAcpToolTable`, `toolPrimer`, `toolRunner`, `toolExtractor`) | The source of the native command vocabulary; filter it by the role's commands |
| Per-tool primers and line recognizers | `src/database/primer.ts` (`DB_PRIMER`, `isDatabaseCommandLine`), `src/browser/command.ts` (`BROWSER_PRIMER`, `isBrowserCommandLine`), `src/question-command.ts` (`QUESTION_PRIMER`, `isQuestionCommandLine`) | Kept unchanged; a granted tool's full primer is still sent |
| No-tools session policy | `runtime.acpWithoutTools` in `src/tab/types.ts`, read in `src/acp/run-prompt.ts` | The precedent for a tab-scoped tool restriction; kept as an override |
| `ask` role lookup and fallback | `src/acp/ask-role.ts` (`askRoleEntries`, `defaultAskEntries`, `attemptOrder`, `exhaustedError`, `NO_ASK_MODEL`) | Generalize from one fixed role name to a named role |
| Prompt orchestration and model fallback | `src/acp/manager.ts` (`AcpManager.run`, `queueFor`, `attempt`, `settleAttempt`) | `tell` runs through the same path with a different role |
| One session per tab | `src/acp/session-manager.ts` (`AcpSessionManager`) and `runtime.acpPrompt` | Extended to one session per tab per role |
| `ask` and `ask reset` commands | `src/commands/ask.ts`, `src/commands/ask-reset.ts` | Templates for `tell` and `tell reset` |
| Roles file read/write and defaults | `src/plugins/roles/roles-file.ts` (`DEFAULT_ROLES`, `readRolesFile`), `role-edits.ts`, `ordered-json.ts` | Add the commands field and the `tell` default |
| Roles shared contract and intent guards | `src/plugins/roles/shared.ts` | Add the commands field and its edit intents |
| Roles tab server activation | `src/plugins/roles/activate.ts` | Register the new intents |
| Role card UI | `web/src/plugins/roles/RoleCard.tsx`, `EntryPicker.tsx`, `roles.css` | Split into models and commands sections |
| Running-entry identity | `acpEntries` carried forward in `updateRunningEntry` (`src/tab/transcript/events.ts:40`) | The pattern for a per-prompt entry set |
| Record names | `recordConnectionName` in `src/plugins/connections/shared.ts:46` | One function feeds every record name surface |
| Live ACP rows and close | `acpEntries` in `src/connection/catalog.ts:27`, `closeAcp` in `src/connection/close.ts` | Add the role segment and routing |

## Proposed changes

### Implementation decisions

- One `AcpManager`/`AcpSessionManager` holds both conversations. Sessions are keyed by tab and role, and the tab runtime's single ACP slots (`acpPrompt`, `acpRecordId`) become a map keyed by role. Every manager method takes a role that defaults to `ask`, so plugin callers (`startAcp`, `promptAcp`, `promptAcpResult`, `resetAcp`) are unchanged and run under `ask`. `acpWithoutTools` stays one tab-wide flag.
- The nine-subcommand vocabulary lives in a new pure core module, `src/acp/native-commands.ts`: the ordered ids and the tool each belongs to. `tool-table.ts` and the roles plugin activation both import it. The roles shared contract stays import-free and receives the vocabulary in the payload.
- The roles tab edits commands through two intents, `add-command` (role, command) and `remove-command` (role, command — removes every copy). Both are no-ops when the file is already in the requested state, and carry no expected-list precondition.
- Remote tabs need no protocol change: remote ACP frames are already keyed by a per-session id (`src/remote/protocol-frames.ts`), so a tab's second session is just a second id on the same channel.

### Changes by module

- `src/acp/native-commands.ts` (new): the ordered vocabulary, a check for whether a string is a native command, and the tool owning each one.
- `src/acp/tool-table.ts`: `createAcpToolTable` takes the role name and its granted commands. A tool with no granted subcommand is left out. Each remaining tool keeps its existing primer and recognizer, and `toolPrimer` appends the allowed-commands line. `toolRunner` names an emitted command's subcommand by matching it against the vocabulary's prefixes (the subcommand is the command's leading words, e.g. `db sqlite create`), and answers an ungranted one with `Command not allowed for role "<role>": <subcommand>.` instead of running it. The primers in `src/database/primer.ts`, `src/browser/command.ts`, and `src/question-command.ts` and their recognizers are unchanged.
- `src/acp/ask-role.ts`: generalized to a named role — resolve its entries and commands from the roles file in effect, with built-in defaults for `ask` and `tell`; the no-models and every-model-failed lines take the role name.
- `src/acp/session-manager.ts`: the `sessions` map (`session-manager.ts:17`, `private sessions = new Map<string, CoreSession>()`) is keyed by tab label and role. `label(label)` (`session-manager.ts:25`), `close`, `entryOf`, `isCurrent`, and `currentSession` take a role defaulting to `ask`. `closeTab` (`session-manager.ts:107`) and `closeAll` close both roles. The record source built at `session-manager.ts:41` (`kind: 'acp' as const, model, ownerLabel: label, ownerName: …`) carries the role.
- `src/acp/manager.ts`: `start`, `prompt`, `promptResult`, `run`, and `cancel` take a role defaulting to `ask`. `run` strips the role's own command word (`^ask\b` today at `manager.ts:69`, `^tell\b` for tell), and `queueFor` reads the named role. The file is at 177 lines, so the per-attempt fallback logic (`attempt`, `settleAttempt`) moves to a new `src/acp/attempt.ts` to keep both under 200.
- `src/tab/types.ts`: the runtime's `acpPrompt` and `acpRecordId` (`types.ts:286-287`) become one map keyed by role, each value holding that role's pending prompt and current record id. `acpEntries` and `acpRecordIds` stay tab-wide, since they only mark entries and records as ACP-owned. Every reader of the old fields moves to the map: `src/acp/response.ts`, `src/acp/record-feed.ts`, `src/acp/run-prompt.ts`, `src/controller/connection-records.ts:19`, `src/plugins/connections-topic-actions.ts:69`, and `src/plugins/connections-topic-rows.ts:68`.
- Concurrent prompts on one tab: today a turn's streaming updates and its settlement find the tab's *last* running markdown entry (`updateRunningEntry` in `src/tab/transcript/events.ts:34`, and `settleAcpPrompt` in `src/acp/response.ts:36`, `tab.log?.findLast((entry) => entry.running && tab.runtime?.acpEntries?.has(entry))`). With ask and tell running at once that picks the other prompt's line. Each pending prompt therefore keeps its own set of the entries it appended, carried forward on replacement exactly as `events.ts:40` carries `acpEntries`, and `RunningEntryMatch` gains an option restricting the match to one prompt's entries; `runCorePrompt`'s `updateRunning` and `settleAcpPrompt` both pass it. `settleAcpPrompt` clears the tab's busy flag (`deleteBusy`) only when the other role has no pending prompt.
- `src/acp/run-prompt.ts`: `runCorePrompt` reads the role's commands for this prompt, builds the tool table from them (none when `runtime.acpWithoutTools` is set, as at `run-prompt.ts:23`), and appends the tell primer line after the tool primer and before `MARKDOWN_INSTRUCTION` for `tell`.
- `src/acp/record-feed.ts`, `src/acp-records/types.ts`, `src/acp-records/validation.ts`: the record source and stored record gain an optional `role`. Records written before this change have none.
- `src/plugins/connections/shared.ts`: `recordConnectionName` (`shared.ts:46`, `` `${row.kind}:${row.ownerName}` ``) returns `acp:<role>:<ownerName>` when the record has a role, and the old form when it does not. That one function feeds the list Name, the connection tab title (`record-tabs.ts`), the client list (`ConnectionList.tsx`, `ConnectionTabMeta.tsx`), and name lookup (`lookup.ts:76`), so they all change together.
- `src/protocol/tab.ts` `AcpRef`: the `tab` scope gains a `role`. `src/connection/catalog.ts` `acpEntries` (`catalog.ts:27`) lists each role's named session with id and display `acp:<role>:<provider/model>`. `openConnectionRecord` (`src/controller/connection-records.ts`) resolves the record of the ref's role. `openAcpTranscript` (`src/controller/transcript.ts`) is unchanged: it snapshots the whole tab transcript, which both roles share.
- `src/plugins/connections-topic-actions.ts` `actOnCoreRecord`: find which role on the owning tab holds the record, and cancel or close that role (the connection tab's **Close session** and cancel).
- `src/connection/close.ts` `closeAcp`: after the existing editor-persona and monitor checks, `tell` or `tell:<…>` closes the tell session, and `ask`, `ask:<…>`, or any other id closes the ask session. The report names the session that closed in the new form, `Closed connection acp:<role>:<provider/model>.`.
- `src/tab/view.ts` and `src/protocol/tab.ts` `TabView.acp`: keep reporting the ask session's model; the field has no client reader today.
- `src/plugins/acp-capabilities.ts`: unchanged calls; they run under the `ask` default.
- `src/commands/tell.ts` and `tell-reset.ts` (new): mirror `ask.ts` and `ask-reset.ts`. Register both in `src/commands/index.ts` with `tellReset` before `tell`, for the same reason the comment at `index.ts:58` gives for `askReset` before `ask`.
- `src/plugins/roles/shared.ts`: `Role` gains `commands`; the payload carries the vocabulary; guards for the payload and the two new intents.
- `src/plugins/roles/roles-file.ts`: decode `commands` (a non-list or a non-string item drops the role and is counted), write it after `entries`, and add the `tell` role and default commands to `DEFAULT_ROLES`. The file is at 196 lines, so role and entry decoding moves to a new `src/plugins/roles/role-decode.ts` first.
- `src/plugins/roles/role-edits.ts` and `activate.ts`: the two intents, through the existing serialized write-then-publish path and refusal lines. `activate.ts` is at 184 lines, so the command intents' handlers go in a new `src/plugins/roles/command-intents.ts` that `activate.ts` registers.
- `web/src/plugins/roles/`: the commands section, the command picker, a pure ordering/options module, and a picker-focus hook, per the UI design below; the model picker gains the same focus and Escape behavior.

### Implementation order

Each step keeps typecheck and tests green on its own:

1. The vocabulary module, the roles file `commands` field with its decoding, defaults, and the `tell` default role, the two intents, and the roles tab UI. Nothing reads `commands` yet, so ACP behaves as before.
2. Tool-table filtering by granted commands and the refusal line, wired into `runCorePrompt` for the `ask` role. From here an `ask` role with no `commands` key runs no tools.
3. Role-keyed session, runtime, and record state with the per-prompt running-entry match, still with only `ask` in use.
4. The `tell` and `tell reset` commands, the tell primer line, and the role segment in connection names, close routing, and records.
5. Specs, help, and user docs.

### Specs and docs

- `product/specs/roles.md`: the commands field, its decoding rules, the `tell` default, default commands, the two sections, and the renamed **Add model**.
- `product/specs/acp.md`: roles grant commands; `tell`, `tell reset`, two conversations per tab, the refusal line, the new names.
- `product/specs/connection.md` and `product/specs/connections-tab.md`: the role segment in names and close routing.
- `help/ask.md`, a new `help/tell.md`, `help/commands.md`, `help/connections.md`, `help/roles.md`.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and `documentation/user-documentation/tab-types/roles.md`.

## UI design

The feature extends the roles tab (`web/src/plugins/roles/`), specifically `RoleCard.tsx`, which today shows a name, a description, the entry rows, and an **Add entry** button that opens `EntryPicker`. Commands are added from a dropdown the same way models are added.

### Layout

- Below the name and description, a card has two stacked sections: `Models`, then `Commands`. Each heading uses the muted 12px description style. The model entry rows, their effort dropdowns, and their drag behavior are unchanged.
- The model section's button is renamed from **Add entry** to **Add model**. The commands section ends with **Add command**.
- Command rows reuse the model entry row style (`roles-entry`): the command text in the normal foreground and a trash icon at the far right, with no harness column and no effort dropdown.
- Command rows are always shown in vocabulary order — the nine-command order above — whatever order the file stores them in, with commands that are not native last in stored order. Hand-written duplicates appear as adjacent rows. Command rows do not drag.
- A command that is not one of the nine is dimmed with the missing-model style (`roles-entry-missing`) and titled `Not a native command`; it keeps its remove control.

### Interaction

- **Add command** is replaced, in place, by a picker: a `command…` dropdown listing, in vocabulary order, the subcommands the role does not yet list, then **Add** (disabled until a command is chosen) and **Cancel**. **Add** adds the command and closes the picker; **Cancel** closes it.
- A command row's remove control removes every copy of that command from the role.
- Adding a command another client already added, or removing one already removed, writes nothing and raises no refusal line; the card shows the current state on the next publication.
- Every other refusal uses the tab's existing single refusal line beneath the source line, and the edit is not applied.

### States

- No commands: a muted `No commands` row above **Add command**.
- No models: a muted `No models` row above **Add model**.
- All nine commands listed: **Add command** is not shown.
- There is no loading or busy state: like every roles edit, a command edit writes the file and the tab redraws from the next publication.
- A narrow pane wraps rows the same way model entry rows wrap today.

### Keyboard and accessibility

- No new key bindings.
- Both pickers — the command picker and the existing model picker — move focus to their first dropdown when they open. Escape inside a picker cancels it. When a picker closes by Add, Cancel, or Escape, focus returns to its **Add command** or **Add model** button.
- Accessible names: the command dropdown is `Command to add to role <name>`; a command row's remove button has the title and label `Remove <command>`; the two row lists are labelled `Models of role <name>` and `Commands of role <name>` by their headings.

### Code organization

- Client code stays in the roles plugin's own directory, `web/src/plugins/roles/`, following `ai/guidelines/react-code-organization.md`: ordering commands into vocabulary order, choosing the picker's options, and deciding whether **Add command** shows live in a pure module with colocated tests; picker focus handling lives in a hook; `RoleCard.tsx` stays thin, with the commands section and the command picker as their own components so the card stays under the file-size limit. Nothing is imported from another plugin.
- The server owns the vocabulary and the file, per `ai/guidelines/architecture-principles.md` §1; the client renders the payload and raises intents, holding no state of its own beyond an open picker and its selection.

## Tests

- `src/plugins/roles/shared.test.ts`: payload and intent guards accept and reject the commands field.
- `src/plugins/roles/roles-file.test.ts`: commands decode, write, and survive a round trip; a missing key reads as no commands; a non-list drops the role and is counted; an unknown string is kept and marked; duplicates are kept; the default file holds `tell` after `ask` with the `ask` entries and each role's default commands.
- `src/plugins/roles/activate.test.ts`: the commands edits write the file and republish; refusals follow the existing lines.
- `src/acp/tool-table.test.ts`: building the table for a granted subset; a tool with no granted subcommand is left out and its lines are not recognized; the primer ends with the allowed-commands line; an ungranted subcommand of a kept tool returns the refusal line and does not run; an empty grant yields no primer.
- `src/acp/ask-role.test.ts`: named-role lookup; missing role uses default models and commands; empty model list keeps the role's own commands.
- `src/acp/manager.test.ts`: a prompt's tool table follows its role's commands, read fresh per prompt; ask and tell run independently on one tab; each refuses only its own overlap; `ask reset` leaves the tell session open and the reverse; tab close closes both; `withoutTools` overrides both.
- `src/acp/manager-fallback.test.ts`: tell falls back through the tell role's entries with the tell wording.
- A new test beside `src/acp/record-feed.test.ts` (or in `manager.test.ts`): with ask and tell both running on one tab, each turn's chunks and settlement update only that prompt's own running entry, and the tab stays busy until both settle.
- `src/commands/tell.test.ts` and `tell-reset.test.ts`: mirror `ask.test.ts` and `ask-reset.test.ts` with the tell wording.
- `src/plugins/connections/shared.test.ts`: `recordConnectionName` with and without a role. `src/plugins/connections/lookup.test.ts`: a record is found by `acp:<role>:<tab name>`, and an old record by `acp:<tab name>`.
- `src/connection/catalog.test.ts`: both sessions are listed as `acp:<role>:<provider/model>`. `src/connection/close.test.ts`: `acp:tell…` closes tell, `acp:ask…` and an unmatched id close ask, and the report names the closed session.
- `src/acp-records/` tests: a record with a role round-trips through the store, and a stored record without one still validates.
- `web/src/plugins/roles/RolesTab.test.tsx`: the two sections render with their headings, empty lines, and accessible names; commands show in vocabulary order with not-native ones dimmed and last; the picker offers only unlisted commands; Add and remove raise `add-command` and `remove-command`; **Add command** disappears when all nine are listed; both pickers focus on open, cancel on Escape, and return focus to their button. The pure ordering/options module gets its own colocated test.

## Out of scope

- Per-database, per-URL, or per-SQL-statement restrictions on a listed subcommand.
- Arbitrary shell commands as native commands.
- Restricting harness tabs by role, or a `tell` on harness tabs.
- Any new reader of the commands of roles other than `ask` and `tell`; they are stored for other consumers only.
- Migrating existing roles files: an `ask` role without `commands` simply grants none.
- Monitors, conversations, and editor persona queries, which keep their own sessions and permission policies (`acp.md` § Shared consumers).

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, with no roles file present: open `roles` and confirm each card shows `Models` and `Commands`, that `ask` lists six commands and `tell` all nine with no **Add command**, and that removing `db sqlite query` from `ask` rewrites `~/.janissary/roles.json`. In a shell tab run `ask create a database called demo` and confirm the reply shows the tool step answered with `Command not allowed for role "ask": db sqlite create.`; then run `tell create a database called demo` and confirm `db sqlite list` shows `demo`. While a `tell` runs, run an `ask` and confirm both settle beneath their own lines. Run `connections list` and confirm `acp:ask:…` and `acp:tell:…`; run `tell reset` and confirm the ask session is still listed.
