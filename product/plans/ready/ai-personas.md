# Specify AI personas by role and move persona queries onto the core ACP pipeline

**Complexity: 7/10** — ~280 added lines across 32 production files, 13 requirements and 22 test scenarios, driven by replacing the persona format, widening core role names to custom roles, and moving both monitor and editor sessions onto the core ACP pipeline (p=7.37).

## Goal

AI persona files currently pin a harness, model and variant in their first line and may opt into a fixed set of tools in a second line. The goal is for a persona to name a role instead, so that the connection it opens uses that role the way `ask` and `tell` do, and for monitor and editor persona queries to run over the same core ACP pipeline those commands use rather than a separate monitor-style session. The feature text is: "AI personas should specify a role instead of a model and tools. When the persona is used, the role must be used in the acp connection. Migrate editor agent support to the same acp pipeline that the ask and tell commands use."

## Requirements

1. "AI personas should specify a role instead of a model and tools."
2. "When the persona is used, the role must be used in the acp connection."
3. "Migrate editor agent support to the same acp pipeline that the ask and tell commands use."
4. "Fail persona load with an error" — when a persona's role cannot be resolved, `loadPersona` throws and no connection is opened.
5. "Fail the persona load" — when a persona's resolved role has no enabled model entries (empty or every entry disabled), loading throws before any connection is attempted.
6. "Role-worded parallel strings": `Persona "<name>" has no role directive. First line must be: [//]: # role:<name>.`, `Persona "<name>" has a malformed role directive.`, `Unknown role "<role>" in persona "<name>".`, and the no-enabled-models error `ACP: the <role> role lists no models.` (the existing `noRoleModels` string in `src/acp/ask-role.ts`). The launcher's own reader uses `ai/personas/launcher/summarizer.md has no role directive. First line must be: [//]: # role:<name>.`
7. "Reuse the core refusal" — when a persona request fires while that role's core prompt is already active, it settles with `ACP: a prompt is already running.` and surfaces through the existing per-consumer failure notification; the active prompt is untouched. ACP connections are per tab, so this conflict is an edge case within a tab.
8. "Widen core to custom role names" — the core pipeline accepts any role name from the roles file, not just `ask` and `tell`.
9. "Extend generic close to any role" — `connections close acp:<role>:<model>` resolves any role name from the roles file, and the row keeps the `acp:<role>:<provider/model>` form; no new reset command.
10. "All shipped personas use ask" — each of the eight shipped persona files names the `ask` role.

## Design decisions

- The persona's first-line directive becomes `[//]: # role:<name>` ("role:<name> via roles.json"), replacing the harness/model/variant triple.
- The role name resolves through the existing roles-file reader in `src/acp/ask-role.ts` the same way `ask` and `tell` do, so custom roles in the roles file in effect are accepted.
- An unresolvable role fails the persona load with a thrown error ("Fail persona load with an error"), mirroring the existing unknown-harness failure; no ACP connection is opened. Detection uses `knownRoleSettings` in `src/acp/ask-role.ts`, which returns `undefined` for an unknown name; `readRoleSettings` is not usable here because it falls back to built-in defaults for an unknown name.
- A role with no enabled model entries also fails the persona load ("Fail the persona load"), so a persona never opens a connection that cannot run a model. The check uses `managers.models.isKnownModel(harness, model)` (`src/models/manager.ts`) at the two connection-opening call sites, not inside `loadPersona`, which stays a pure file parser. A model disabled after load is still handled by the core pipeline's fallback at prompt time.
- Old-format persona files are a hard break ("Hard break; shipped files migrated"): only the eight shipped `ai/personas/` files are rewritten; user-authored old files fail to load with an error and are edited by hand. No compatibility shim or auto-migration.
- Documentation work is recorded as one follow-up feature candidate for the prose documentation page only ("Follow-up candidate: prose page only"): "User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan." No documentation page is written here and no in-app help or key-binding row is named.
- Persona-load errors use role-worded messages parallel to today's harness ones ("Role-worded parallel strings"), with the exact strings listed in Requirements.
- A persona prompt colliding with an active prompt for the same role reuses the core refusal ("Reuse the core refusal"); core ACP sessions are per tab, so the collision is confined to one tab and needs no new queue or cancellation path.
- All three persona kinds switch to the role directive: `monitor`, `editor`, and the launcher summarizer ("All three kinds" — the launcher still primes only the body, so its directive is parsed but never used to open a connection).
- The `[//]: # tools:` line is removed from the persona format ("Remove it; migrate shipped personas") — web tools now come from the role's `commands`, and the shipped `ai/personas/` files are rewritten to the role directive with no tools line.
- When a persona runs, its named role is the role used for the ACP connection (feature text), reusing the roles-file resolution the `ask` and `tell` readers use (`src/acp/ask-role.ts`).
- Both monitor and editor persona connections use the resolved role and both run on the core ACP pipeline ("Both move onto the core pipeline"), replacing the monitor-style `spawnMonitorSession` path for both; the launcher opens no connection and still primes only the body.
- The core role key is widened from `AcpRole = 'ask' | 'tell'` to any role name from the roles file ("Widen core to custom role names"), including the prompt-prefix and role-state typing and the role enumeration in `src/connection/catalog.ts`.
- `connections close` resolves any role name rather than falling back to `ask` ("Extend generic close to any role"); the `acp:<role>:<provider/model>` row form is unchanged and no new reset command is added.
- All eight shipped persona files name `ask` ("All shipped personas use ask"), whose grants include `web search` and `web fetch` for `link-scout`.
- Only the query-line interaction and status-pill states are preserved ("Query-line UX only"): session reuse/isolation/close routing and connection presentation may change with the pipeline.
- Per-persona connection rows are dropped ("Drop persona rows; reuse core role rows"): a persona query uses the tab's existing core role connection row; there is no `<persona> (acp)` row or persona-specific close control.

## Preserved behavior

1. The query line opens when `>` is typed at the very start of an otherwise-empty line — must not open when `>` is typed mid-line or on a line that already holds text — pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("opens the query line when > is typed as the first character of an empty line").
2. Enter, Ctrl+Enter (Cmd+Enter on macOS) and the `run` pill fire a runnable query — must not insert a buffer newline or fire when the query is not yet a valid `> <persona> <prompt>` — pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("fires on Enter when the query is runnable and never inserts a buffer newline").
3. The status pill keeps its exact labels and ordering — `agent?` before a persona is named, `query?` once named, `run` when runnable, `running...` in flight, `no suggestion` after an empty reply — and must not gain new wording or a different priority — pinned by `web/src/editor/suggest-request.test.ts` ("shows agent? when no known persona is named yet").
4. Tab completes a persona name in the query text, yielding to the pill once the request is runnable — must not complete a name while the pill holds focus — pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("focuses the pill on Tab in priority over completion once the request is runnable").

## Assumptions

1. Personas are markdown files under `ai/personas/<kind>/`, named by filename, whose first line is "a required harness directive" (`src/personas.ts:4-7`).
2. `parseDirective` in `src/persona-parsing.ts:36-56` currently accepts only `[//]: # <harness>:<model>:<variant>`, with `harness` limited to `opencode` or `claude`.
3. The optional second line is a tools declaration parsed by `parsePersonaTools`, whose allowlist is `SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch']` (`src/persona-parsing.ts:9`).
4. Editor persona sessions are currently spawned with `spawnMonitorSession(persona, cwd, ...)` (`src/editor/acp-manager.ts:41`).
5. `spawnMonitorSession` in `src/monitor/acp.ts:17` builds a launch from `persona.harness` and forwards `persona.tools` as `allowedTools`; both fields disappear with the role-based `Persona`.
6. The launcher reads its persona body through its own `readPersonaBody` in `src/plugins/launcher/persona.ts`, not through `loadPersona`, and validates the harness directive there.
7. The core ACP role vocabulary is `ACP_ROLES = ['ask', 'tell']` (`src/acp/role.ts:1`), and role entries and grants are read by `readRoleSettings` in `src/acp/ask-role.ts` from the roles file in effect.
8. Roles live in `~/.janissary/roles.json`, replaced wholesale by a project `.janissary/roles.json`, each role holding ordered `entries` (harness, model, optional effort) and a `commands` list (`product/specs/roles.md:26-29`).
9. Editor in-buffer queries are typed as `> <persona> <prompt>` and offer the editor-specific persona set (`product/specs/editor-tab.md:697-702`).

## Existing functionality

1. Role resolution by name, with fallback to built-in defaults and model-disabled filtering — `readRoleSettings` / `knownRoleSettings` in `src/acp/ask-role.ts`.
2. The existing no-models string and the ordered multi-model attempts with fallback notices — `noRoleModels`, `attemptOrder`, `fallbackNotice` and `exhaustedError` in `src/acp/ask-role.ts`.
3. The roles-file reader that resolves project over home without creating a file — `readRolesFile` in `src/plugins/roles/roles-file.ts`.
4. The enabled-model predicate used by core ACP to filter role entries — `isKnownModel` in `src/models/manager.ts`.
5. The core role-session prompt entry point and its prompt driver — `AcpManager.promptResult` / `AcpManager.run` in `src/acp/manager.ts` and `runCorePrompt` in `src/acp/run-prompt.ts`. These are typed to `AcpRole` (`ask` | `tell`) today, so a persona naming a custom role needs that type widened to role names from the roles file.
6. Per-tab, per-persona session lifecycle with context recording and connection rows — `EditorAcpManager` in `src/editor/acp-manager.ts`.
7. The current persona-backed session spawn used by both monitors and editor queries — `spawnMonitorSession` in `src/monitor/acp.ts`.
8. The editor query handler that loads the persona and drives its session — `editorSuggest` in `src/editor-suggest/handler.ts`.
9. The launcher's independent persona-body reader — `readPersonaBody` in `src/plugins/launcher/persona.ts`.
10. The client/server messages for editor persona queries and connection close — `editorPersonas`, `editorSuggest`, `closeEditorConnection` in `src/message/editor.ts`.
11. Connection-row catalog and close routing for editor personas — `src/connection/catalog.ts`, `src/connection/close.ts`, plus the editor-scope `AcpRef` in `src/plugins/connections/shared.ts` and `src/plugins/shell/shared.ts`, and its transcript branch in `src/controller/transcript.ts`.

## Implementation steps

1. Change the persona format first: replace `parseDirective` and `parsePersonaTools` in `src/persona-parsing.ts` with a role-directive parser that returns the role name, drop the tools allowlist, and adjust the `Persona` type and `loadPersona` in `src/personas.ts` accordingly. Rewrite the eight shipped files under `ai/personas/` to `[//]: # role:ask` with no tools line, so every shipped persona resolves and `link-scout` keeps web access. Update `readPersonaBody` in `src/plugins/launcher/persona.ts` to accept the role directive and use the launcher error wording from Requirements; it still returns only the body. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

2. Add role resolution at the connection-opening call sites: `editorSuggest` in `src/editor-suggest/handler.ts` and the monitor start path in `src/monitor/manager.ts`. Use `knownRoleSettings` from `src/acp/ask-role.ts` to reject an unknown role, and `managers.models.isKnownModel` over that role's entries to reject a role with no enabled model, throwing the exact strings in Requirements before any connection opens. Keep `loadPersona` a pure file parser. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

3. Move both consumers onto the core ACP pipeline: remove `spawnMonitorSession` from `src/monitor/acp.ts` and rewire its callers in `src/monitor/manager.ts`, `src/monitor/session.ts` and `src/monitor/live-monitors.ts`, then rewire the editor path in `src/editor-suggest/handler.ts`. Each persona prompt goes through `AcpManager.promptResult` / `AcpManager.run` in `src/acp/manager.ts` and `runCorePrompt` in `src/acp/run-prompt.ts`, so core owns connection and prompt lifecycle and the role's own primer replaces the per-persona priming and tool-loop code the monitor path used. Because those entry points are typed to `AcpRole` (`ask` | `tell`) at `src/acp/role.ts:1` and `src/tab/types.ts:300`, this step widens the role key and its prompt-prefix handling in `src/acp/manager.ts`, the role-state typing in `src/acp/role-state.ts`, and the role enumeration in `src/connection/catalog.ts`, so a persona can name a custom role from the roles file. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

4. Extend `coreAcpTarget` in `src/connection/close.ts` so an `acp:<role>:<model>` id resolves any role name from the roles file instead of falling back to `ask`; keep the generic row form and add no reset command. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

5. Remove the per-persona connection plumbing that step 3 makes dead: the session map and context store in `src/editor/acp-manager.ts`, its construction in `src/controller/create-managers.ts`, the editor-scope `AcpRef` branches in `src/connection/catalog.ts`, `src/connection/close.ts`, `src/plugins/connections/shared.ts`, `src/plugins/shell/shared.ts` and `src/controller/transcript.ts`, and the `closeEditorConnection` case in `src/message/editor.ts` plus its adapter method. The editor query line, its status pill and the preserved behaviors in this plan's `Preserved behavior` section are not touched. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

6. Reconcile the specs that describe the old format and connection behavior: `product/specs/monitoring.md`, `product/specs/editor-tab.md`, `product/specs/acp.md`, `product/specs/connection.md`, `product/specs/connections-tab.md` and `product/specs/roles.md`. A user-documentation page is not written here; the prose-page candidate is recorded in Out of scope. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. Editor in-buffer persona queries are entered on the ephemeral query line described in `product/specs/editor-tab.md` ("In-editor persona suggestions"), with the persona name after `>`; this is the surface the feature operates on.
2. Per-persona connection rows are removed ("Drop persona rows; reuse core role rows"); the tab's connections window shows the core role connection row (`acp:<role>:<provider/model>`) that the persona query now uses.
3. The editor query line and the core connections window are the two surfaces involved; no new surface is added.
4. Dismissal uses the generic core close path ("Generic core close path"): `connections close acp:<role>:<model>` or the core row's existing Close control, with the connections window's existing focus behavior and no persona-specific control.
5. Failures surface through notifications ("Reuse existing failure text", "use notifications for errors") using the existing `<persona>: <message>` wording; the pill falls back to `no suggestion` and the query line stays open with its text for retry.
6. No key bindings are added and the reused core connection row keeps its existing accessible name ("No new bindings; core row name"); the query-line bindings stay as they are, so `help/keys.md` gains no entry.
7. Visuals are unchanged ("Reuse both components unchanged"): `EditorLine` keeps `editor-row-query` and the `editor-suggest-pill` badge, and core connection rows keep their existing style; no new CSS or badge.

## Tests

1. `src/personas.test.ts` and the `src/persona-parsing.ts` tests cover the role directive, the removed tools line and the exact load errors (Requirements 1, 4, 5, 6).
2. Tests for `editorSuggest` in `src/editor-suggest/handler.test.ts` and for the monitor start path in `src/monitor/manager.test.ts` show the named role is resolved for the connection and that an unknown role or one with no enabled model fails before opening one (Requirement 2, 4, 5).
3. `src/monitor/acp.test.ts` no longer pins `persona.harness` or `persona.tools` forwarding; the core pipeline's role-session tests cover both consumers instead (Requirement 3).
4. The editor query path on the core pipeline is covered in `src/editor-suggest/handler.test.ts`, keeping the query-line behaviors named under Preserved behavior pinned by `web/src/editor/handleSuggestKeyDown.test.ts` and `web/src/editor/suggest-request.test.ts` (Requirement 3).
5. Connection catalog and close tests in `src/connection/catalog.test.ts` and `src/connection/close.test.ts` no longer expect editor-persona rows, and `src/controller/transcript.ts` coverage follows the removed `AcpRef` branch (UI design items 2 and 4).
6. Core role tests cover a custom role name from the roles file, including its connection row and `connections close acp:<role>:<model>` resolution (Requirements 8 and 9).

## Out of scope

- Exposing role tools to ACP models as direct MCP tools is a separate, deferred backlog item.
- The prose documentation page describing persona files is not written here; the work is recorded as a follow-up feature candidate only, and no in-app help page or key-binding row is named.

## Verification

End with `$janissary/scripts/run.mjs check-diff`, then perform a concrete end-to-end check against the running app: open an editor tab whose buffer holds text, type `> assistant rewrite this paragraph in one sentence` on an empty line, press Enter, and confirm the reply previews an inline change whose accept/decline works as before while the connections window shows the core `acp:<role>:<provider/model>` row and no `<persona> (acp)` row. As a second check, start a monitor with a shipped persona and confirm its connection is the same core role row, and that a persona file with an unknown role fails to load with `Unknown role "<role>" in persona "<name>".`
