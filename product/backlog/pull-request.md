<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle a subagent command granted to a persona role

Existing Issue: src/acp/run-prompt.ts passes the persona's declared role into `createInvocationContext` as `acpRole`, but src/subagent/launch.ts resolves the caller through `managers.acp.sessionIdentity` and `providerSessionId`, which read the ask/tell `acpRoles` map rather than the tab's `personaRoles` slot, so a persona that grants `subagent` fails with `Subagent: caller session is not available.` Severity: 5/10

Existing Risk: 5/10 - A custom role that grants `subagent` looks fully configured in the roles tab but every attempt from a persona session fails, and the same can happen for a persona declaring `ask` because its session lives in a separate slot from the shell's ask session.

Proposal Risk: 3/10 - Teaching the caller-identity lookup about persona slots plus a focused test restores the granted command without touching the ask/tell path; the remaining risk is keeping persona identity in sync across close and respawn, which the existing slot tests cover.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "support subagent grants from persona role sessions". Extend `PersonaRoleRuntime` in src/acp/persona-role-state.ts with the session's provider id captured from the connection in src/acp/persona-role-session.ts, and let the caller-identity lookups in src/acp/session-manager.ts fall back to that persona slot when no ask/tell session exists for the role, keeping the existing ask/tell lookup first. In src/subagent/launch.ts keep the same error for an unresolved persona session, so an agent with no identity still fails loudly. Add a regression test in src/acp/persona-role.test.ts that grants `subagent` to a custom role, drives a persona prompt whose reply issues that command, and asserts the caller identity resolves; keep src/acp/run-prompt.test.ts and src/subagent/launch.test.ts passing unchanged.
