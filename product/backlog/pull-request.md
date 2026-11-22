<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the monitoring spec's claim that every role-backed monitor prompt runs the command tool loop

Existing Issue: product/specs/monitoring.md says a monitor uses its role's command grants "through the same tool loop as ask and tell", but only the priming prompt goes through `promptPersonaRole` and `runCorePrompt` while each periodic flush in src/monitor/live-monitors.ts calls `reg.session.prompt` directly with no `AcpToolHost`, so granted commands are not executed on flush replies. Severity: 5/10

Existing Risk: 5/10 - A contributor relies on the spec to assume a monitor's periodic flush can run a granted native command, and a role configured with such a grant silently yields a parsed suggestion instead of an executed command.

Proposal Risk: 3/10 - Scoping the spec and description language to what the code actually does removes a misleading guarantee without changing runtime behavior; any later decision to run the tool loop on flushes stays a separate design change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "scope the monitor tool-loop claim to priming". Rewrite the "Role-backed sessions" paragraph in product/specs/monitoring.md to state that the declared role configures the session and its grants are applied through the core tool loop on the priming prompt, while periodic flush prompts post directly to that session and their replies are parsed for suggestions rather than executed as commands. Align the corresponding sentence in the pull request's "What" section so it does not claim the autonomous command tool loop behaves identically on every monitor prompt. Do not change runtime behavior in src/monitor/session.ts or src/monitor/live-monitors.ts. Verify by reading the spec against both call paths and by keeping the priming and flush tests in src/monitor/manager.test.ts passing unchanged.


* Handle a subagent command granted to a persona role

Existing Issue: src/acp/run-prompt.ts passes the persona's declared role into `createInvocationContext` as `acpRole`, but src/subagent/launch.ts resolves the caller through `managers.acp.sessionIdentity` and `providerSessionId`, which read the ask/tell `acpRoles` map rather than the tab's `personaRoles` slot, so a persona that grants `subagent` fails with `Subagent: caller session is not available.` Severity: 5/10

Existing Risk: 5/10 - A custom role that grants `subagent` looks fully configured in the roles tab but every attempt from a persona session fails, and the same can happen for a persona declaring `ask` because its session lives in a separate slot from the shell's ask session.

Proposal Risk: 3/10 - Teaching the caller-identity lookup about persona slots plus a focused test restores the granted command without touching the ask/tell path; the remaining risk is keeping persona identity in sync across close and respawn, which the existing slot tests cover.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "support subagent grants from persona role sessions". Extend `PersonaRoleRuntime` in src/acp/persona-role-state.ts with the session's provider id captured from the connection in src/acp/persona-role-session.ts, and let the caller-identity lookups in src/acp/session-manager.ts fall back to that persona slot when no ask/tell session exists for the role, keeping the existing ask/tell lookup first. In src/subagent/launch.ts keep the same error for an unresolved persona session, so an agent with no identity still fails loudly. Add a regression test in src/acp/persona-role.test.ts that grants `subagent` to a custom role, drives a persona prompt whose reply issues that command, and asserts the caller identity resolves; keep src/acp/run-prompt.test.ts and src/subagent/launch.test.ts passing unchanged.
