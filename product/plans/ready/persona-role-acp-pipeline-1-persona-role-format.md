# Personas declare an ACP role in their first line

**Complexity: 5/10** — ~20 added production lines across 10 edited production files (two modules and eight bundled personas), 8 requirements and 8 scenarios (p=5.631)

## Goal

Change the persona file contract so the first line names an ACP role and every later line is the startup prompt, then convert all bundled personas and the loader tests to that format. This is the foundation the role-backed ACP sessions in later subplans consume: it removes the harness/model/variant directive and the tool allowlist as the persona's configuration source without yet changing how any session is launched.

Dependencies: the source plan `product/plans/complete/persona-role-acp-pipeline.md` is the unchanged canonical scope; no earlier subplan.

## Requirements

1. "AI personas should specify a role instead of a model and tools." A persona's configuration source becomes its declared role, not a harness/model/variant directive or a `tools:` line (source requirement 1).
2. "A persona declares its role on its first line exactly as `[//]: # role: <name>`." (source requirement 8)
3. "All three families" — editor, monitor, and launcher-summarizer personas all declare a role; none keeps the old directive (source requirement 4).
4. "All bundled personas declare the `ask` role." (source requirement 13)
5. "A persona file without a valid `role:` directive fails to load and is not listed, with the exact error `Persona \"<name>\": expected first line [//]: # role: <role>.`" (source requirement 11)
6. "An old `[//]: # tools: ...` line left in a persona file is treated as ordinary prompt body text, with no error." (source requirement 12)
7. "A persona may declare any role name that resolves through the effective roles file, including a custom role." At this layer only that any name parses as a role; resolution belongs to subplan 2 (shared source requirement 14).
8. "Personas keep their existing job of priming a session with their own instructions; only the way the session is configured and launched changes." The body stays everything after the first line (source Goal).

## Design decisions

- The role replaces both the harness/model/variant directive and the `tools:` line as the source of a session's model and tool configuration; neither line configures anything after this change. This follows the source Design decisions first bullet and its Implementation steps.
- Extend the existing `parseDirective` at `src/persona-parsing.ts:36` (quoted `export function parseDirective`) to read the role from the first line; do not add a parser module.
- A leftover `tools:` line needs no special handling: only the first line is configuration, so the leftover line is read as body text.
- All eight bundled personas under `ai/personas/editor/`, `ai/personas/monitor/`, and `ai/personas/launcher/` declare `ask`, so a project persona is the only way to name another role.
- Any role name is accepted at load time; whether it resolves in the effective roles file is the pipeline's concern in subplan 2.
- `Persona` at `src/personas.ts:14` (quoted `export type Persona = {`) changes from `{ name, harness, body, tools }` to `{ name, role, body }`. The helpers `SUPPORTED_PERSONA_TOOLS`, `isPersonaToolsLine`, and `parsePersonaTools` at `src/persona-parsing.ts:9`, `src/persona-parsing.ts:14`, and `src/persona-parsing.ts:22` leave the persona configuration path; nothing parses or validates tools here any more.
- `listPersonas` at `src/personas.ts:49` (quoted `export function listPersonas`) currently lists by filename without reading the file. To satisfy the "is not listed" half of requirement 5 it must read the first line of each candidate and skip a file whose role directive is missing or malformed.
- This is the first link in a stacked chain. The only production readers of the removed fields are the persona launcher `spawnMonitorSession` at `src/monitor/acp.ts:17` and the launcher plugin's independent reader at `src/plugins/launcher/persona.ts:23`. Subplan 2 replaces the first and subplan 4 updates the second; land the chain in order rather than treating this subplan as a runnable checkpoint on its own.

## Assumptions

1. Personas are markdown files under `ai/personas/<kind>/<name>.md`, keyed by filename, with the first line a directive and the remaining lines the startup prompt — `src/personas.ts:4` (quoted `AI personas: markdown files under`) and `src/personas.ts:29` (quoted `export function loadPersona`).
2. A persona currently carries `name`, `harness`, `body`, and `tools` — `src/personas.ts:14` (quoted `export type Persona = {`).
3. The current first-line directive has the form `[//]: # <harness>:<model>:<variant>` parsed by `parseDirective`, restricted to `opencode` and `claude` — `src/persona-parsing.ts:36` (quoted `export function parseDirective`) and `src/persona-parsing.ts:48` (quoted `harness !== 'opencode' && harness !== 'claude'`).
4. A current persona's tools come from an optional `[//]: # tools:` line, limited to `web_search` and `web_fetch` — `src/persona-parsing.ts:9` (quoted `SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch']`) and `src/personas.ts:44` (quoted `const hasTools = isPersonaToolsLine(secondLine);`).
5. The eight bundled personas are the complete shipped set — `ai/personas/editor/assistant.md`, `ai/personas/launcher/summarizer.md`, and `ai/personas/monitor/activity.md`, `algorithm.md`, `assistant.md`, `link-scout.md`, `researcher.md`, `security.md` — each opening with a harness directive on line 1.
6. The loader test home is `src/personas.test.ts:21` (quoted `describe('loadPersona'`), which writes synthetic persona files into a temporary root and asserts both successful loads and exact error text; there is no separate persona-parsing test file.

## Existing functionality

1. Persona loading from disk and the first-line directive contract — `src/personas.ts:29` (`loadPersona`) and `src/persona-parsing.ts:36` (`parseDirective`).
2. Persona name enumeration by filename — `src/personas.ts:49` (`listPersonas`).
3. The `[//]: # ` comment prefix shared by the current directive and tools line — `src/persona-parsing.ts:11` (`const COMMENT_PREFIX`).
4. The bundled persona corpus that must keep loading after the format change — `ai/personas/editor/assistant.md` and the files listed in assumption 5.
5. The synthetic-file test fixture pattern used by the loader tests — `src/personas.test.ts:9` (`function writePersona`).

## Implementation steps

In `src/persona-parsing.ts`, change `parseDirective` so it requires the exact prefix `[//]: # role: `, trims the remainder as the role name, accepts any nonempty name, and throws `Persona "<name>": expected first line [//]: # role: <role>.` for a missing or malformed first line. Remove `PersonaHarness`, `SUPPORTED_PERSONA_TOOLS`, `isPersonaToolsLine`, and `parsePersonaTools`; no replacement tool parser is introduced.

In `src/personas.ts`, narrow `Persona` to a name, a role, and a body, and make `loadPersona` build it from the parsed first line plus the remaining lines joined and trimmed. No second-line inspection remains. Change `listPersonas` to read each `.md` candidate's first line and return only names whose directive parses to a role, so an invalid persona fails to load and is not offered by completion. The two `loadPersona` call sites at `src/monitor/manager.ts:52` and `src/editor-suggest/handler.ts:43` pass the persona through unchanged and need no edit here.

Replace the first eight bundled persona directives with `[//]: # role: ask`, preserving each body verbatim, including the `link-scout` persona whose old `tools:` line becomes ordinary body text.

Move the directive tests in `src/personas.test.ts` onto the role format: role parsed from line 1, exact error text for a missing or malformed directive, a leftover tools line preserved in the body, a custom role name accepted, an invalid file omitted from `listPersonas`, and the real bundled editor and monitor personas loading with role `ask`. Delete the old harness-parsing and tools-parsing cases at `src/personas.test.ts:22` through `src/personas.test.ts:86` and the harness assertions in the real-file cases at lines 89 to 114 rather than leaving tests for deleted behavior. Add the launcher reader's own directive check to `src/plugins/launcher/persona.test.ts` only in subplan 4, where that reader is actually changed. No implementation code goes into this plan.

## UI design

1. No user-visible surface changes in this subplan. The only observable artifacts are persona file contents (a first line reading `[//]: # role: ask`) and the loader error text asserted by tests.

## Tests

1. Source requirements 8 and 11, in `src/personas.test.ts`: a first line `[//]: # role: <name>` loads with that role, and a missing or malformed directive throws exactly `Persona "<name>": expected first line [//]: # role: <role>.`.
2. Source requirement 12, in `src/personas.test.ts`: a second line `[//]: # tools: web_search` is included verbatim in the body and throws nothing.
3. Source requirement 11, in `src/personas.test.ts`: a persona file with a bad first line is not returned by `listPersonas`.
4. Source requirements 4 and 13, in `src/personas.test.ts`: the real bundled editor and monitor personas load with role `ask`.
5. Source requirement 14, in `src/personas.test.ts`: a custom role name such as `planning` parses unchanged.
6. Session-level behavior is untested here by design; those tests land with the launch-path subplans.

## Out of scope

How a resolved role starts a session, model fallback, role grants, notifications for unknown roles or roles with no enabled models, and the editor, monitor, and launcher launch paths. The `ask` and `tell` commands, the editor `>` request line and hunk results, and the roles file format are unchanged (source Out of scope). No new parser module is added.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the changed server modules and tests. Manual check: create a scratch persona under a temporary project's `ai/personas/monitor/` with first line `[//]: # role: planning`, run the loader through the `src/personas.test.ts` test file against that root, and confirm it reports role `planning` with the remaining lines as body. Change the first line to the old harness directive and confirm the exact error above and that `listPersonas` omits the file. Because this is the first stacked link, also confirm with `git status` that no source file outside the named ones changed.
