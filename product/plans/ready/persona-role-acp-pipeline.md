# Personas name an ACP role and editor agent uses the ask/tell ACP pipeline

**Complexity: 7/10** — ~215 added lines across 16 production files (eight source modules plus eight bundled personas) and 17 distinct requirements, driving p=7.06.

## Goal

Make AI personas declare an ACP role rather than a harness/model/variant directive and a tool list, and have every session a persona opens run with that role's model entries and command grants through the same core ACP pipeline the `ask` and `tell` commands use. Editor agent suggestions are the consumer explicitly named for migration onto that pipeline, but all three bundled persona families change. Personas keep their existing job of priming a session with their own instructions; only the way the session is configured and launched changes.

## Requirements

1. "AI personas should specify a role instead of a model and tools." A persona declares a role and no longer carries the harness/model/variant directive or the `tools:` line as its configuration source.
2. "When the persona is used, the role must be used in the acp connection."
3. "Migrate editor agent support to the same acp pipeline that the ask and tell commands use."
4. "All three families" — editor, monitor, and launcher-summarizer personas all declare a role; none keeps the old directive. (User answer to scope question.)
5. "Same pipeline for all" — monitor and launcher-summarizer sessions also run through the core ACP role pipeline, not a separate simple launcher. (User answer to monitor/launcher path question.)
6. "Full role grants for all" — a persona session uses its role's command grants and the same command tool loop as `ask` and `tell`, with no persona-specific tool mode. (User answer to persona tool-grants question.)
7. "Persona names a role" — editor `>` requests keep naming a persona, and that persona's declared role configures the session. (User answer to editor role-flow question.)
8. A persona declares its role on its first line exactly as `[//]: # role: <name>`. (User answer to role-directive wording question.)
9. An unknown role starts no session and produces no reply line; the only signal is the notification `Persona "<persona>" requests unknown role "<role>".` (User answers to unknown-role, error-wording, and outcome questions.)
10. A role with no enabled model entries starts no session and produces no reply line; the only signal is the notification `Persona "<persona>" finds no enabled models in role "<role>".` (User answers to no-enabled-models and wording questions.)
11. A persona file without a valid `role:` directive fails to load and is not listed, with the exact error `Persona "<name>": expected first line [//]: # role: <role>.` (User answers to old-persona-files and load-error wording questions.)
12. An old `[//]: # tools: ...` line left in a persona file is treated as ordinary prompt body text, with no error. (User answer to leftover-tools-line question.)
13. All bundled personas declare the `ask` role. (User answer to bundled-role question.)
14. A persona may declare any role name that resolves through the effective roles file, including a custom role. (User answer to custom-role question.)
15. "Editor UI, ask/tell, roles format" stay unchanged: the editor `>` request line and hunk results, the `ask` and `tell` commands, and the roles file format are not changed. (User answer to scope-boundary question.)
16. Persona sessions get one session slot per role name on the tab, so two personas declaring different custom roles on one tab get separate sessions. (User answer to custom-role-names question in the final phase.)
17. The launcher summarizer's declared role configures the launcher tab's ACP session, so the summarizer runs under that role's models. (User answer to launcher-role-wiring question in the final phase.)

## Design decisions

- "AI personas should specify a role instead of a model and tools." The persona's declared role replaces the harness/model/variant directive and the `tools:` line as the source of the session's model and tool configuration.
- "When the persona is used, the role must be used in the acp connection." A persona session resolves and uses the declared role through the core ACP role pipeline the way `ask` and `tell` do, rather than launching a persona-specific subprocess from the directive.
- "Migrate editor agent support to the same acp pipeline that the ask and tell commands use." Editor persona suggestions run through that pipeline instead of the monitor-session launcher they use today.
- All three bundled persona families declare a role; monitor and launcher sessions use the same core ACP role pipeline as the editor, so there is one persona-session path. (User answers to scope and monitor/launcher path questions.)
- A persona session uses its role's command grants and tool loop. A role that grants no commands leaves the session tool-less. The `ask` role's read grants therefore apply to the bundled personas, which all declare `ask`. (User answers to tool-grants and bundled-role questions.)
- Editor persona files stay and the `>` request keeps naming a persona; the persona's role configures the session. Any role name that resolves in the effective roles file is allowed. (User answers to editor role-flow and custom-role questions.)
- Persona configuration failures are notifications, not request replies: an unknown role, or a role with no enabled models, starts no session and yields no answer line. (User answers to unknown-role, outcome, and no-enabled-models questions.)
- The role directive is `[//]: # role: <name>`; a missing or malformed one fails persona load with `Persona "<name>": expected first line [//]: # role: <role>.`, and a leftover `tools:` line is read as body text. (User answers to directive-wording, load-error, and leftover-tools questions.)
- Persona sessions are keyed by role name on the tab, not folded into the `ask`/`tell` slots, so different custom roles on one tab keep separate sessions and their own resolved settings. (User answer to custom-role-names question in the final phase.)
- The launcher summarizer's declared role configures the launcher tab's ACP connection rather than being a checked-but-unused line. Its existing `withoutTools: true` tab mode still applies, so the summarizer cannot run commands. (User answer to launcher-role-wiring question; `src/plugins/launcher/summarizer.ts:206`.)

## Assumptions

1. Personas are markdown files under `ai/personas/<kind>/<name>.md`, keyed by filename, with the first line a directive and the remaining lines the startup prompt — `src/personas.ts:4` (`AI personas: markdown files under \`ai/personas/monitor/\` ... and \`ai/personas/editor/\``) and `src/personas.ts:29` (`loadPersona`).
2. A persona currently carries `name`, `harness`, `body`, and `tools` — `src/personas.ts:14` (`export type Persona = {`).
3. The current first-line directive has the form `[//]: # <harness>:<model>:<variant>` parsed by `parseDirective`, restricted to `opencode` and `claude` — `src/persona-parsing.ts:36` (`export function parseDirective`) and `src/persona-parsing.ts:48` (`harness !== 'opencode' && harness !== 'claude'`).
4. A current persona's tools come from an optional `[//]: # tools:` line, limited to `web_search` and `web_fetch` — `src/persona-parsing.ts:9` (`SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch']`) and `src/personas.ts:44` (`const hasTools = isPersonaToolsLine(secondLine);`).
5. Monitor sessions and editor persona sessions share one launcher, `spawnMonitorSession`, which builds the subprocess from `persona.harness` and passes `persona.tools` as allowed tools — `src/monitor/acp.ts:17` (`export function spawnMonitorSession`) and `src/editor/acp-manager.ts:41` (`spawnMonitorSession(persona, cwd, ...)`).
6. `ask` and `tell` both delegate to `runAcpCommand` with a fixed role name — `src/commands/ask.ts:11` (`'ask'`) and `src/commands/tell.ts:11` (`'tell'`).
7. The role's model entries and command grants are read fresh for each prompt, with built-in fallbacks when the role is missing or empty — `product/specs/acp.md:29` (`The \`ask\` role's model entries and native-command grants come from the roles file in effect`) and `product/specs/roles.md:223` (`The core ACP sessions behind \`ask\` and \`tell\` read roles`).
8. Role names resolve by trimmed, case-insensitive comparison against the effective roles file — `product/specs/roles.md:236` (`A role name is matched ignoring surrounding whitespace and case`).

## Existing functionality

1. Role definitions in the effective `~/.janissary/roles.json` or project `.janissary/roles.json`, read fresh per prompt — `product/specs/roles.md:26` (`Roles live in \`~/.janissary/roles.json\``) and `product/specs/acp.md:29`.
2. Role-name resolution by trimmed, case-insensitive name with the stored spelling reported back — `product/specs/roles.md:236` (`A role name is matched ignoring surrounding whitespace and case`).
3. The core ACP role pipeline that `ask` and `tell` enter through `runAcpCommand`, including model fallback and the autonomous command tool loop — `src/commands/ask.ts:11`, `src/commands/tell.ts:11`, and `product/specs/acp.md:35` (`### Model fallback`).
4. Role sessions' deny-all internal-tool configuration, so a role grants only native commands — `product/specs/acp.md:41` (`Role connections deny every internal tool in two layers`) and `product/specs/roles.md:231` (`Role connections deny all of their harness's internal tools`).
5. Persona loading and directive parsing — `src/personas.ts:29` (`loadPersona`) and `src/persona-parsing.ts:36` (`parseDirective`).
6. The editor's persistent per-persona ACP sessions, reused across suggestion requests — `src/editor/acp-manager.ts:13` (`Owns the persistent, multi-turn ACP sessions an editor tab's in-editor persona suggestions open`).
7. The notifications feed used for persona configuration failures — `product/specs/notifications.md:3` (`Every notification the user is given is held in a **notification queue**`) and `src/notifications/index.ts:194` (`export function notify(`).
8. The editor suggestion handler that loads an editor persona and drives its persistent session — `src/editor-suggest/handler.ts:43` (`loadPersona(match, 'editor')`) and `src/editor-suggest/handler.ts:65` (`managers.editorAcp.session(...)`).
9. The monitor manager that loads a monitor persona — `src/monitor/manager.ts:52` (`loadPersona(personaName, 'monitor')`).
10. The launcher summarizer's own persona reader, which checks the first-line directive and reads only the body because the summarizer runs on the launcher tab's core ACP connection, not a persona-spawned process — `src/plugins/launcher/persona.ts:23` (`export function readPersonaBody`) and `src/plugins/launcher/persona.ts:19` (`Only the body is used`).
11. The core ACP prompt entry point used by `ask`/`tell`, which drives the role's session, grants, and tool loop — `src/acp/response.ts:51` (`export function runAcpCommand`) and `src/acp/response.ts:71` (`managers.acp.promptResult(...)`).
12. The core role type that currently admits only `ask` and `tell`, while the roles-file resolver accepts arbitrary names — `src/acp/role.ts:1` (`export const ACP_ROLES = ['ask', 'tell'] as const`) and `product/specs/roles.md:236` (`A role name is matched ignoring surrounding whitespace and case`).

## Implementation steps

Change the persona definition so a persona names a role instead of carrying a harness/model/variant directive and a tool list: update the existing persona type and loader in `src/personas.ts` and extend the existing `parseDirective` in `src/persona-parsing.ts:36` to read `[//]: # role: <name>` from the first line — no new parser module — with the load error `Persona "<name>": expected first line [//]: # role: <role>.` for a missing or malformed directive. A leftover `tools:` line needs no special handling because it is simply read as body text. Update the two host call sites that load personas, `src/monitor/manager.ts` and `src/editor-suggest/handler.ts`, along with the bundled persona files in `ai/personas/editor/`, `ai/personas/monitor/`, and `ai/personas/launcher/` to declare `ask`. The launcher's own reader in `src/plugins/launcher/persona.ts` is a plugin that cannot import host internals, so it must accept the new directive independently; it still sends only the body to the launcher tab's connection.

Replace the persona-specific launcher path: resolve the persona's declared role with the existing `knownRoleSettings` at `src/acp/ask-role.ts:67` (or `readRoleSettings` at `src/acp/ask-role.ts:61` once the role is known) and start the session through the core ACP role pipeline entered by `runAcpCommand` in `src/acp/response.ts`, so the role's model entries, model fallback, command grants, and tool loop all apply. A role that `knownRoleSettings` does not resolve, or that has no enabled models, starts no session and emits only the exact notification decided above through the existing `notify` helper, with no request reply. Keep the persona's body as the session's startup prompt. Because `knownRoleSettings` accepts arbitrary names while `AcpManager` is keyed by `AcpRole` (`ask`/`tell`) at `src/acp/manager.ts:27` and `src/acp/role.ts:1`, give persona sessions their own per-tab slot keyed by the resolved role name. Own that slot on the tab record through the managing service, following the architecture rule that per-agent state lives on the tab record rather than a new map on the controller; reuse the editor's existing keyed-session ownership pattern in `src/editor/acp-manager.ts` for the connection, close, death, and transcript behavior instead of building a second one.

Migrate monitor sessions, which currently spawn through `spawnMonitorSession`, onto that pipeline. Migrate editor agent suggestions from the raw `AcpSession.prompt` call in `src/editor-suggest/handler.ts` onto it as well, reusing the editor's existing persistent-session ownership and its connection, close, and death-handling behavior so its hunk parsing and incremental priming still work. The launcher summarizer already runs through the launcher tab's core ACP connection rather than a persona-spawned process; pass its declared role into that connection's setup so the summarizer runs under the role's models, while keeping the existing `withoutTools: true` mode at `src/plugins/launcher/summarizer.ts:206` so it cannot run commands. Leave the editor's `>` request line, hunk results, the `ask`/`tell` commands, and the roles file format unchanged.

Update the specs that describe persona directives, monitor and editor sessions, and role behavior so they match the new file format and launch path. Add and update colocated tests alongside the changed server modules.

## Tests

1. Cover that a persona file declares a role via `[//]: # role: <name>` and that loading yields that role; cover the exact load error for a missing or malformed directive and the body-text treatment of a leftover `tools:` line — tied to requirements 1, 8, and 11 — in `src/personas.test.ts` (where the directive tests already live; there is no separate persona-parsing test file), plus the launcher reader's directive check in `src/plugins/launcher/persona.test.ts`.
2. Cover that a persona-driven session resolves the declared role and uses its models and grants, including a custom role and with `ask` for the bundled personas — tied to requirements 2, 5, 6, 13, and 14 — in `src/monitor/session.test.ts`, `src/editor/acp-manager.test.ts`, and the launcher's `src/plugins/launcher/summarizer.test.ts` for the role-configured connection.
3. Cover the notification-only failures for an unknown role and a role with no enabled models, including exact notification text and the absence of a reply — tied to requirements 9 and 10 — in the persona session tests.
4. Cover that editor agent suggestions run through the core ACP role pipeline — tied to requirement 3 — in `src/editor/acp-manager.test.ts`, `src/editor-suggest/handler.test.ts`, and the shared-pipeline tests in `src/acp/run-prompt.test.ts`.

## Out of scope

The editor `>` request line, its edit-hunk result format, and any other editor UI are unchanged. The `ask` and `tell` commands and the roles file format are unchanged. No new protocol message, RPC, or client surface is introduced. Only the persona file format, persona loading, and the launch path for persona sessions change, plus the specs and tests that describe them.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression from the changed server modules and specs.

Then do a concrete end-to-end check against the running app: launch Janissary on a project whose roles file defines a role with a distinct enabled model, set an editor persona's first line to `[//]: # role: <that role>`, open an editor tab, and issue a `>` suggestion request with that persona. The suggestion must come through the role's configured model, the editor's connections window must show the persona session as a role-backed ACP connection, and editing the persona to name a missing role must produce the exact unknown-role notification with no answer in the editor. A failure of any of those checks means the migration did not land correctly.
