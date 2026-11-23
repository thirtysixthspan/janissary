# Reconcile the behavior specs and verify the persona pipeline end to end

**Complexity: 1/10** — no production code or tests (6 specs, 2 requirements only), reading and end-to-end verification (p=2.35)

## Goal

Earlier subplans changed how persona files are written and how persona requests reach ACP. This subplan brings the behavior specs that describe those areas in line with the shipped behavior, carries the documentation follow-up candidate as an Open item, and performs the parent plan's concrete end-to-end verification. No application code changes here.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md`, `./product/plans/ready/ai-personas-2-role-resolution-and-validation.md`, `./product/plans/ready/ai-personas-3-core-role-widening-and-generic-close.md`, `./product/plans/ready/ai-personas-4-editor-queries-on-the-core-acp-pipeline.md`, `./product/plans/ready/ai-personas-5-monitors-on-the-core-acp-pipeline.md` and `./product/plans/ready/ai-personas-6-drop-per-persona-connection-plumbing.md`.

## Requirements

1. The specs that describe the old persona format and connection behaviour are updated to describe the role directive, core-pipeline routing and core role rows: `product/specs/monitoring.md`, `product/specs/editor-tab.md`, `product/specs/acp.md`, `product/specs/connection.md`, `product/specs/connections-tab.md` and `product/specs/roles.md`.
2. A user-documentation page is not written here; the prose-page candidate is recorded as an Open item only, and no in-app help page or key-binding row is named.

## Design decisions

- Specs describe behavior precisely, including exact error strings and edge cases, and name the implementation only where it disambiguates behaviour (linked to Assumption 1).
- A behavior change updates its spec in the same change; because this is the final subplan of the feature, all six affected specs are reconciled here rather than split across earlier commits (linked to Assumption 2).
- No page under `documentation/user-documentation/` or `documentation/developer-documentation/` is created or edited. The gap is a follow-up feature candidate for the owner of `update-documentation.md`, not a requirement of this plan.
- Verification is reading-based for the spec edits and end-to-end for the application behaviour, because the feature as a whole changes what the user sees (linked to Assumption 3).

## Preserved behavior

None found. The four query-line and status-pill behaviors were pinned and left unedited in subplan 4; this subplan only ensures the specs describe them the same way.

## Assumptions

1. `product/specs/` is the authoritative behavior documentation and specs state exact messages and edge cases — `ai/guidelines/developer-documentation.md:11-32` ("Every file in `product/specs/` is a behavior spec").
2. A behavior change updates its spec in the same change — `ai/guidelines/architecture-principles.md:77` ("A behavior change updates its `product/specs/` file in the same change").
3. A plan that changes application behaviour ends with a concrete end-to-end check against the running app — `ai/guidelines/plan-template.md:59-61`.
4. The old persona format is described in `product/specs/monitoring.md` at the "Persona web tools" section, including the `tools:` line and the unknown-tool error — `product/specs/monitoring.md:68-79`.

## Existing functionality

1. `product/specs/roles.md` already describes roles, entries and commands — `product/specs/roles.md` (roles-file behaviour).
2. `product/specs/editor-tab.md` already describes in-editor persona suggestions — `product/specs/editor-tab.md` ("In-editor persona suggestions").
3. `product/specs/acp.md`, `product/specs/connection.md` and `product/specs/connections-tab.md` already describe core ACP sessions and connection rows, which are the surfaces persona requests now reuse.

## Implementation steps

1. In `product/specs/monitoring.md`, replace the harness-directive and `tools:`-line description with the `[//]: # role:<name>` directive, state that web tools now come from the role's `commands`, remove the `Persona "<name>" requests unknown tool …` string, and add the exact role-worded load errors. Keep the monitor naming, flush, framing, reporting-tab and suggestion behavior descriptions unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/editor-tab.md`, update the in-editor persona suggestion flow so a query runs on the tab's core ACP role connection, uses the role's grants, surfaces the core refusal through the existing notification, and shows the core `acp:<role>:<provider/model>` row with no persona-specific row. Keep the query-line, pill labels and focus behavior exactly as they are. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `product/specs/acp.md`, describe a core role key that may be any role name from the roles file, the role-derived prompt prefix, and the shared `ACP: a prompt is already running.` refusal now also reached by persona requests. In `product/specs/roles.md`, note that a persona names a role and that its `commands` supply web tools. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `product/specs/connection.md` and `product/specs/connections-tab.md`, remove the editor-persona and monitor-style session rows, state that persona requests reuse the core `acp:<role>:<provider/model>` row, and describe `connections close acp:<role>:<model>` resolving any roles-file role with no reset command. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Perform the end-to-end verification below and record the prose-page candidate in the Open item of the implementation report; do not add it to any spec, help page or plan requirement. Build command for every step: `$janissary/scripts/run.mjs check-diff`; every step leaves the tree green.

## UI design

1. No UI is changed by this subplan. The specs must describe the surfaces already built: the editor query line and pill, the connections window's core role row and its generic close control, and the monitor reporting tab.
2. No new badge, colour, style, binding or accessible name is introduced; `help/keys.md` stays untouched.

## Tests

1. This subplan changes no application behaviour and introduces no code, so no new tests are introduced, per `ai/guidelines/plan-template.md`.
2. Confirm the tests added in subplans 1 to 6, including the four preserved-behavior web tests from subplan 4, still pass under `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Exposing role tools to ACP models as direct MCP tools is a separate, deferred backlog item.
- The prose documentation page describing persona files is not written here; it is a follow-up feature candidate owned by the documentation workflow. No in-app help page or key-binding row is named.
- No source code, config or spec outside the six named files is edited by this subplan.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Then perform a reading-based check: read the six named specs and confirm none still describes a harness/model/variant first line, a `tools:` line, a `<persona> (acp)` row or a monitor-style session connection, and that each states the role directive and core role row consistently.

Then perform the concrete end-to-end check against the running app. Open an editor tab whose buffer holds text, type `> assistant rewrite this paragraph in one sentence` on an empty line, press Enter, and confirm the reply previews an inline change whose accept/decline works as before while the connections window shows the core `acp:<role>:<provider/model>` row and no `<persona> (acp)` row. As a second check, start a monitor with a shipped persona and confirm its connection is the same core role row. Finally, point a persona file at an unknown role and confirm it fails to load with `Unknown role "<role>" in persona "<name>".` Restore the file afterwards. A failure of any of these checks means an earlier subplan did not land completely.
