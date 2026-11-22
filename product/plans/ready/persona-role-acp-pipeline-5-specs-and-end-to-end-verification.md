# Reconcile persona role specs and verify the pipeline end to end

**Complexity: 1/10** — no production code (3 requirements, 5 read/manual scenarios, p=3.216)

## Goal

Close the seams between the four implementation slices: make every spec that describes persona directives and persona sessions agree with the role-backed path, confirm the old directive, tool allowlist, and persona launcher are gone, and perform the concrete end-to-end check the source plan requires. This slice adds no application behavior; it makes the delivered feature consistent and verified.

Dependencies: the source plan `product/plans/complete/persona-role-acp-pipeline.md` and all earlier subplans — `product/plans/ready/persona-role-acp-pipeline-1-persona-role-format.md`, `product/plans/ready/persona-role-acp-pipeline-2-core-role-session-pipeline.md`, `product/plans/ready/persona-role-acp-pipeline-3-monitor-editor-role-migration.md`, and `product/plans/ready/persona-role-acp-pipeline-4-launcher-summarizer-role.md`.

## Requirements

1. "Editor UI, ask/tell, roles format stay unchanged: the editor `>` request line and hunk results, the `ask` and `tell` commands, and the roles file format are not changed." (source requirement 15)
2. "Update the specs that describe persona directives, monitor and editor sessions, and role behavior so they match the new file format and launch path." (source Implementation steps)
3. "Run `$janissary/scripts/run.mjs check-diff` ... Then do a concrete end-to-end check against the running app" with the exact scenario and outcomes in the source Verification section.
4. All 17 source requirements and their edge cases are present across the four earlier subplans, with no orphaned old-path scaffolding left behind.

## Design decisions

- Spec edits describe behavior that already shipped in the earlier slices; they do not introduce new behavior. The files to reconcile are `product/specs/monitoring.md` at lines 68 to 79 (persona tool allowlist becomes role grants), `product/specs/editor-tab.md` at lines 671 to 758 (editor persona session configuration), `product/specs/launcher.md` at line 62 (summarizer connection role), `product/specs/acp.md` at lines 29, 40, 51, and 402 (role entries read fresh, deny-all tool layers, session identity, and the statement that monitors and editor queries are separate consumers now sharing the role pipeline), `product/specs/roles.md` at lines 223 to 244 (arbitrary role resolution), and `product/specs/connection.md` at lines 11 and 67 plus `product/specs/connections-tab.md` at line 11 (role-backed persona connection rows).
- `product/specs/notifications.md` needs no new event: subplan 2 reuses the existing `manual` event, whose body is verbatim and which already documents focus-suppression bypass and no toggle at line 371. Only if an implementer chose a different event would this spec need an entry, and that choice is already settled in subplan 2.
- Old-path removal is a verification, not a new cleanup task: grep must find no remaining `parseDirective` harness form, no `SUPPORTED_PERSONA_TOOLS`, `isPersonaToolsLine`, or `parsePersonaTools` in `src/`, and no `spawnMonitorSession` or `allowedTools: persona.tools` in the launch path. If any survives, the responsible earlier subplan is incomplete and must be fixed there before this slice is done.
- No new protocol message, RPC, client surface, notification event, or roles file change is introduced (source Out of scope).
- This slice is reading- and verification-based: it changes specs only, so its manual check is a concrete reading check plus the end-to-end app check the source plan explicitly requires.

## Assumptions

1. The four earlier subplans are implemented in order and their behavior is present — `product/plans/ready/persona-role-acp-pipeline-1-persona-role-format.md` through `product/plans/ready/persona-role-acp-pipeline-4-launcher-summarizer-role.md`.
2. `product/specs/` is authoritative for behavior and must match the code in the same change — `ai/guidelines/architecture-principles.md` principle 10 and `ai/guidelines/developer-documentation.md` "Specs describe behavior precisely".
3. A behavior change needs an end-to-end manual check in addition to the diff-scoped command — `ai/guidelines/plan-template.md` Verification section.
4. The source plan's end-to-end scenario is the acceptance check — `product/plans/complete/persona-role-acp-pipeline.md` Verification section.
5. No new event type was added, so the notifications spec's event list is already correct — `product/specs/notifications.md:371`.

## Existing functionality

1. The authoritative behavior specs to reconcile — `product/specs/monitoring.md`, `product/specs/editor-tab.md`, `product/specs/launcher.md`, `product/specs/acp.md`, `product/specs/roles.md`, and `product/specs/connection.md`.
2. The diff-scoped verification command — `AGENTS.md` "Verifying changes".
3. The running-app launch path used for the manual check — `ai/guidelines/sandbox-e2e-browser.md` "What to point it at" and `bin/janus.mjs`.
4. The implementation suite that must stay green — `src/**/*.test.ts` under the server vitest project.

## Implementation steps

Read each spec named in the first design decision next to the code it describes and edit only the sentences that still describe the harness/model/variant directive, the persona tool allowlist, or a separate persona subprocess launcher. Replace them with the role-backed contract: first line `[//]: # role: <name>`, role settings read fresh from the effective roles file, role grants and the shared tool loop, per-role session slots, and notification-only configuration failures. Keep the exact error and notification strings from source requirements 9, 10, and 11 verbatim.

Grep the server tree for the retired symbols and paths listed in the third design decision. If any remain, return the affected earlier subplan to draft, fix it there, and repeat its improvement and rating before continuing; do not implement a fix in this slice.

Run the diff-scoped check command and then the end-to-end check from the source plan: launch Janissary on a project whose roles file defines a role with a distinct enabled model, set an editor persona's first line to `[//]: # role: <that role>`, open an editor tab, and issue a `>` suggestion request with that persona. Require that the suggestion comes through the role's configured model, that the editor's connections window shows the persona session as a role-backed ACP connection, and that editing the persona to name a missing role produces the exact unknown-role notification with no answer in the editor. A failure of any of those checks means the migration did not land correctly and the responsible earlier subplan must be reopened. No implementation code goes into this plan.

## UI design

1. No new or changed user interface in this slice. The end-to-end check observes the existing editor suggestion flow, the connections window, and the notifications feed.

## Tests

1. This slice introduces no code and therefore no new tests; `ai/guidelines/plan-template.md` directs a plan of this kind to say so explicitly.
2. Confirm the existing tests from subplans 1 to 4 still cover source requirements 1 to 17, especially the exact error and notification strings, the custom-role and no-enabled-model cases, the two-per-role-slot case, and the summarizer's tool-less session, and reopen the responsible subplan if a gap is found.
3. Tests of documentation are not introduced.

## Out of scope

Any new behavior, source code, protocol surface, or notification event. Reopening a decided scope question: the editor `>` request line, hunk results, `ask` and `tell`, and the roles file format stay unchanged. Reimplementing work that belongs to the earlier subplans; this slice only verifies and, where needed, sends work back to them.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression across the changed specs and the landed source modules. Reading check: read `product/specs/monitoring.md`, `product/specs/editor-tab.md`, `product/specs/launcher.md`, `product/specs/acp.md`, `product/specs/roles.md`, `product/specs/connection.md`, and `product/specs/connections-tab.md` and confirm none still describes a harness directive, a persona tool allowlist, or a separate persona subprocess, and that each describes a role-backed core ACP session with the exact failure strings. Then perform the end-to-end app check in Implementation steps, including the missing-role case, and treat any mismatch as a defect in an earlier subplan rather than a documentation nuance.
