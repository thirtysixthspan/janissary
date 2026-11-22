# Replace persona harness directives with a role directive and migrate the shipped personas

**Complexity: 5/10** — ~35 added lines, 12 files (parser, loader, launcher, six monitor personas plus editor and launcher personas), 8 scenarios (p=5.58)

## Goal

Persona files currently pin a harness, model and variant on their first line and may grant web tools on a second line. This subplan changes the file format to a single `[//]: # role:<name>` directive, so a persona names a role rather than a subprocess. It rewrites all eight shipped personas to name `ask`, updates the launcher's independent reader to the same directive with launcher-worded errors, and adapts the existing monitor-session spawner to launch from the role's entries. The file format is a hard break: user-authored old-format files fail to load and are edited by hand, with no compatibility shim.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on no earlier subplan.

## Requirements

1. "AI personas should specify a role instead of a model and tools." The first line is `[//]: # role:<name>` and no second config line is recognised.
2. "All shipped personas use ask" — each of the eight shipped files under `ai/personas/` names the `ask` role and carries no tools line; `link-scout` keeps web access through the `ask` role's grants rather than a file directive.
3. "Role-worded parallel strings": a missing first-line directive throws `Persona "<name>" has no role directive. First line must be: [//]: # role:<name>.`, a malformed one throws `Persona "<name>" has a malformed role directive.`, and the launcher reader throws `ai/personas/launcher/summarizer.md has no role directive. First line must be: [//]: # role:<name>.` for a missing directive.
4. "All three kinds" — `monitor`, `editor` and the launcher summarizer all use the role directive; the launcher still parses but never uses the role to open a connection, returning only the body.
5. "Remove it; migrate shipped personas" — the `[//]: # tools:` line is removed from the format and from every shipped file.

## Design decisions

- The first-line directive becomes `[//]: # role:<name>` and replaces the harness/model/variant triple; this is a hard break for user-authored files (linked to Assumption 1 and Assumption 2).
- The role name is a plain string on `Persona` (`role`); the harness/model/variant and tools fields are removed from the type and from the parser. The connection-opening call sites resolve that role later (subplan 2).
- `loadPersona` stays a pure file parser: it reads and validates the directive and the body, and does no role-file or model-catalog I/O.
- The existing `spawnMonitorSession` export keeps its name and `(persona, cwd, hooks)` shape in this subplan but launches from the named role's first enabled entry via `acpLaunchForEntry`; it forwards no `allowedTools` because web tools now come from the role's `commands` (linked to Assumption 4 and Assumption 5). Keeping the export stable is what lets the monitor and editor callers still compile here; the spawner is removed in a later subplan when both consumers move onto the core pipeline.
- The launcher reader keeps its own implementation because a plugin cannot import the host's `src/personas.ts`; only the directive it accepts and its error wording change (linked to Assumption 6).
- Only the eight shipped files are rewritten. No auto-migration, no dual-format parser, and no `tools:` compatibility line.

## Preserved behavior

None found. The four query-line and status-pill behaviors the source plan preserves live in the web editor surface, which this subplan does not touch; they are carried and pinned in subplan 4.

## Assumptions

1. Personas are markdown files under `ai/personas/<kind>/` named by filename, whose first line is "a required harness directive" — `src/personas.ts:6-7` (`The first line is a required harness directive`).
2. `parseDirective` in `src/persona-parsing.ts:36` currently accepts only `[//]: # <harness>:<model>:<variant>` with `harness` limited to `opencode` or `claude` — `src/persona-parsing.ts:48` (`if (harness !== 'opencode' && harness !== 'claude')`).
3. The optional second line is a tools declaration parsed by `parsePersonaTools`, whose allowlist is `SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch']` — `src/persona-parsing.ts:9`.
4. The launcher reads its persona body through its own `readPersonaBody` in `src/plugins/launcher/persona.ts:23`, validating the harness directive there — `src/plugins/launcher/persona.ts:28` (`startsWith('[//]: # ')`).
5. `spawnMonitorSession` in `src/monitor/acp.ts:17` builds a launch from `persona.harness` and forwards `persona.tools` as `allowedTools` — `src/monitor/acp.ts:19` (`acpLaunchFor(persona.harness)`) and `src/monitor/acp.ts:22` (`allowedTools: persona.tools`).
6. `acpLaunchForEntry` already builds a role entry's launch, including internal-tool denial — `src/acp/launch.ts:39` (`export function acpLaunchForEntry(entry: RoleEntry)`).
7. Exactly eight personas ship: one editor, one launcher, six monitor; `link-scout` is the only one with a `tools:` line. The built-in `ask` role grants `web search` and `web fetch` — `src/plugins/roles/default-roles.ts:49` (`'web search', 'web fetch',`), so rewriting `link-scout` to `ask` preserves its web access.
8. The launcher reader is called from `src/plugins/launcher/activate.ts:215` (`personaBody: readPersonaBody(...)`) with the project root; changing only the directive it accepts and its error string leaves that caller valid.

## Existing functionality

1. The role-file reader `readRoleSettings` already resolves a role name to ordered entries — `src/acp/ask-role.ts:61` (`export function readRoleSettings`).
2. `acpLaunchForEntry` already turns a `RoleEntry` into an `AcpLaunch` with the right adapter and internal-tool denial — `src/acp/launch.ts:39` (`export function acpLaunchForEntry`).
3. `connectAcp` already opens a session from an `AcpLaunch` and `cwd` — `src/monitor/acp.ts:18` (`return connectAcp({`).
4. `listPersonas` already enumerates persona names from the directory — `src/personas.ts:49` (`export function listPersonas`).
5. The launcher's `SHIPPED_PERSONA` fallback path already handles a project with no persona of its own — `src/plugins/launcher/persona.ts:8` (`const SHIPPED_PERSONA`).

## Implementation steps

1. In `src/persona-parsing.ts`, replace the harness/tools parser with a role-directive parser. Name the parsing function `parseRoleDirective(name, line)`; it takes the trimmed first line, requires the `[//]: # role:` prefix, extracts a non-empty role name, and throws exactly the two role-worded strings in Requirements 3 for a missing or malformed directive. Delete `PersonaHarness`, `SUPPORTED_PERSONA_TOOLS`, `isPersonaToolsLine` and `parsePersonaTools`; no tools line is accepted anywhere. Do not add a second config-line parser.
2. In `src/personas.ts`, change `Persona` to `{ name: string; role: string; body: string }`. `loadPersona` keeps its missing-file error, calls `parseRoleDirective` on the trimmed first line, treats every remaining line as body, and returns no `harness` or `tools`. Update the header comment to describe the role directive. Keep `listPersonas` unchanged.
3. Rewrite the eight files under `ai/personas/` so line one is exactly `[//]: # role:ask`, followed by a blank line and the unchanged body; delete the `tools:` line from `ai/personas/monitor/link-scout.md` entirely. Do not rename any persona or alter any body text.
4. In `src/plugins/launcher/persona.ts`, change `readPersonaBody` to require a `[//]: # role:` first line and to throw the launcher-worded string from Requirement 3 when it is missing or malformed. Keep returning `lines.slice(1).join('\n').trim()` and keep the `SHIPPED_PERSONA` fallback; the parsed role is intentionally discarded because the summarizer opens no connection. Update the explanatory comment so it no longer describes a harness directive or a subprocess claim.
5. In `src/monitor/acp.ts`, keep `spawnMonitorSession(persona, cwd, hooks)` exported with the same signature, but import `readRoleSettings` from `../acp/ask-role.js` and `acpLaunchForEntry` from `../acp/launch.js`, resolve `readRoleSettings(cwd, persona.role).entries[0]` and pass that entry to `acpLaunchForEntry`. Remove the `acpLaunchFor`/`PersonaHarness` imports and the `allowedTools` field. Decide the two edge cases now so no half-configured connection opens: if the role has no entries, call `hooks.onError` with `noRoleModels(persona.role)` then throw that same error; if `acpLaunchForEntry` returns `undefined` for an adapter-less harness, call `hooks.onError` with a one-line harness error then throw it. The pre-open validation that makes the first case unreachable arrives in subplan 2, but this function must not silently launch with a missing model in the meantime. Do not otherwise validate the role here. Both edited files stay well under the 200-line `max-lines` limit, so no extraction is needed.
6. Update the colocated tests: `src/personas.test.ts` to assert `role: 'ask'` from the shipped files and the new missing/malformed strings; `src/monitor/acp.test.ts` so it no longer pins `persona.harness` or `persona.tools` forwarding and instead asserts the launch comes from the role's first entry; and any launcher reader test that asserts the old harness error. Build command for every step: `$janissary/scripts/run.mjs check-diff`. Each step must leave the tree green.

## UI design

1. No user-visible surface is added or changed. The persona files are developer-authored configuration, and the launcher summarizer's rendered status paragraph is unchanged because only its first line is ignored differently.
2. The editor query line and its status pill render exactly as before; this subplan changes no component, style, badge or key binding.

## Tests

1. `src/personas.test.ts` covers Requirement 1 (role directive parsed), Requirement 2 (each shipped file loads with `ask`) and Requirement 3 (missing/malformed directive strings). Use a temporary root for malformed fixtures so the shipped files stay untouched.
2. `src/plugins/launcher/persona.test.ts` covers Requirement 3's launcher-worded string (replace its current `has no harness directive` assertion at line 45) and Requirement 4 (body returned with the directive stripped). The `readPersonaBody` caller in `src/plugins/launcher/activate.ts` needs no test change.
3. `src/monitor/acp.test.ts` covers the adaptation in step 5: the launch is built from the role's first entry and no `allowedTools` are forwarded (Requirement 1's "instead of a model and tools").

## Out of scope

- Role resolution, unknown-role rejection and enabled-model validation at the two connection-opening call sites belong to subplan 2; this subplan deliberately does not add them.
- Moving monitor and editor sessions onto the core ACP pipeline and deleting `spawnMonitorSession` belong to subplans 4 and 5.
- A prose documentation page describing the new persona format is not written here; the feature candidate is recorded in subplan 7 and in the parent plan's Out of scope.
- User-authored old-format files are not migrated: the hard break is intentional.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based check, open `ai/personas/editor/assistant.md`, `ai/personas/launcher/summarizer.md` and all six `ai/personas/monitor/*.md` files and confirm each first line is exactly `[//]: # role:ask` and that no `[//]: # tools:` line remains anywhere under `ai/personas/`. Then read `src/personas.ts` and `src/plugins/launcher/persona.ts` and confirm neither mentions `harness`, `model`, `variant` or `tools` in its parsing path; a leftover mention means the format change was not completed.
