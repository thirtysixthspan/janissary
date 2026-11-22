# Update the monitor spec to describe the role directive and role-granted web tools

**Complexity: 1/10** — spec-only change: 0 added production lines, 0 production files edited, 7 documentation requirements, no tests (p=3.04)

## Goal

The AI personas change replaced the old `[//]: # <harness>:<model>:<variant>` first-line directive and the optional second-line `[//]: # tools:` web-tools opt-in with a single `[//]: # role:<name>` directive, and rewrote every shipped persona to name `ask`. The functional spec `product/specs/monitoring.md` still describes the removed format and the removed `requests unknown tool` load error. This plan reconciles that spec with the shipped behavior so a contributor who follows it writes a valid role-format persona and understands that web access is granted by the persona's role, not by a line in the persona file. The change edits only spec prose; no application behavior changes.

## Requirements

1. "no longer shows a `[//]: # claude:Sonnet:high` example or a `[//]: # tools: web_search, web_fetch` opt-in" — the "Persona web tools" section contains neither example.
2. "remove the claim that an unknown tool name fails persona load with the old `requests unknown tool` error" — the `Persona "<name>" requests unknown tool "<x>" (supported: web_search, web_fetch).` message no longer appears.
3. "state instead that a persona's first line is `[//]: # role:<name>`" — the "Persona web tools" section states this.
4. "that every shipped persona names the `ask` role" — the section states this.
5. "web access now comes from the role's `commands` rather than a persona-file directive" — the section states this.
6. "noting that the default `ask` role in src/plugins/roles/default-roles.ts grants `web search` and `web fetch`" — the section names those two grants of the default `ask` role.
7. "Update the page's opening summary that says a persona may opt into a small fixed set of web tools so it reflects the role-based grants" — the opening summary no longer claims a persona opts into web tools through its own file.

## Design decisions

- The repair is a documentation-only edit to `product/specs/monitoring.md`; no source, test, help, or `documentation/` tree file is edited (linked to Assumptions 1–5).
- The "Persona web tools" section is rewritten in place; every other section of the spec — naming, reporting-tab metadata, transcript feeds, flush cycle, suggestions, asking, rating, lifecycle, and keyboard focus — stays byte-for-byte unchanged.
- Web access is described as a role grant via the role's `commands`, naming the default `ask` role's `web search` and `web fetch` grants, rather than as a persona-file directive (linked to Assumption 3 and Assumption 4).
- The trust consideration is kept but reframed: a monitor receives full target transcripts, so the web access its role grants is the relevant trust decision instead of a checked-in persona-file opt-in.
- No help update is made: no page under `help/` describes the persona file format. User and developer documentation is owned by `update-documentation.md`, not by this plan.

## Preserved behavior

None found. This plan changes only prose in a functional spec; it adds, removes, or alters no application behavior, and the colocated persona and launcher tests that pin the parsed role and the absence of a tools line keep passing untouched.

## Assumptions

1. A persona's first line is now the role directive `[//]: # role:<name>` — `src/persona-parsing.ts:7` (`const ROLE_PREFIX = '[//]: # role:'`) and `src/persona-parsing.ts:9` (`export function parseRoleDirective`).
2. Every shipped persona names `ask` — `ai/personas/monitor/assistant.md:1` (`[//]: # role:ask`), and the same first line is present in the other five monitor personas, the editor persona and the launcher persona.
3. Web tools now come from the role's grants, not a persona directive — `src/monitor/acp.ts:10` (`web tools now come from the role's grants rather than a persona directive, so none are forwarded here`).
4. The default `ask` role grants `web search` and `web fetch` through its `commands` — `src/plugins/roles/default-roles.ts:49` (`'web search', 'web fetch',`).
5. The old-format examples and the `requests unknown tool` error string exist only in `product/specs/monitoring.md` and are not described by any page under `help/`.

## Existing functionality

1. The role-directive parser that validates a persona's first line — `src/persona-parsing.ts:9` (`export function parseRoleDirective`).
2. The default roles list whose `ask` role carries the web command grants — `src/plugins/roles/default-roles.ts:3` (`export const DEFAULT_ROLES`) and `src/plugins/roles/default-roles.ts:38` (`name: 'ask'`).
3. The shipped personas' role directives — `ai/personas/monitor/assistant.md:1` (`[//]: # role:ask`).
4. The spec sections being edited — `product/specs/monitoring.md:3` (opening summary) and `product/specs/monitoring.md:66` (`### Persona web tools`).

## Implementation steps

1. In `product/specs/monitoring.md`, update the opening summary (currently "Monitors are tool-less by default; a persona may opt into a small fixed set of web tools (see Persona web tools below).") so it describes web access as granted by the persona's role rather than opted into through the persona file, while leaving the rest of the paragraph about persona-driven sessions and inline or reporting-tab suggestions unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/monitoring.md`, rewrite the "Persona web tools" section in place. Remove the `[//]: # claude:Sonnet:high` and `[//]: # tools: web_search, web_fetch` example, the comma-separated/case-insensitive/de-duplicated tools-line rules, the `Persona "<name>" requests unknown tool "<x>" (supported: web_search, web_fetch).` load-error claim, the `connectAcp`/`classifyTool` harness-specific enforcement prose, and the "enabling web tools on the opencode harness is not yet supported" line. In their place state that a persona's first line is `[//]: # role:<name>`, that every shipped persona names the `ask` role, that web access now comes from the role's `commands` rather than a persona-file directive, and that the default `ask` role grants `web search` and `web fetch`. Reframe the trust consideration around the role's grants and keep the section's heading. Do not edit any other section of the spec. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user-visible surface is added or changed. The change edits only a functional spec file; no component, style, badge, layout, or key binding is touched.

## Tests

This plan changes only prose in a functional spec and introduces no code or application behavior, so no tests are added. The colocated persona and launcher tests (`src/personas.test.ts` and the launcher reader test) that pin the parsed role and the absence of a tools line must keep passing untouched; correctness is confirmed by the reading-based check in Verification rather than by new tests.

## Out of scope

- No production code changes: the persona parser, loader, launcher reader, and monitor ACP spawner stay exactly as they are.
- No edits to `documentation/user-documentation/` or `documentation/developer-documentation/`; those trees are owned by `update-documentation.md`.
- No help page changes; no page under `help/` describes the persona file format.
- No change to the pull request title or description.
- The other recorded backlog entries — relocating the legacy `PersonaHarness` type and updating editor-suggest test mocks — are separate work items, not part of this repair.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based check, open `product/specs/monitoring.md` and confirm the opening summary no longer says a persona may opt into a small fixed set of web tools through its own file, and that the "Persona web tools" section contains no `[//]: # claude:Sonnet:high` example, no `[//]: # tools:` opt-in, and no `requests unknown tool` error. Confirm it instead states that a persona's first line is `[//]: # role:<name>`, that every shipped persona names `ask`, and that web access comes from the role's `commands` with the default `ask` role granting `web search` and `web fetch`. Cross-check those claims against `src/persona-parsing.ts`, `ai/personas/monitor/assistant.md`, and `src/plugins/roles/default-roles.ts`. Any surviving old-format example or tools-line claim means the change was not made correctly.
