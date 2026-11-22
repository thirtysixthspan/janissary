<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the user documentation that still describes the removed persona web tools and per-persona editor connections

Existing Issue: The monitoring user page teaches the old `[//]: # claude:<model>:<variant>` directive and a `[//]: # tools: web_search, web_fetch` allowlist that the loader now treats as prompt text, and the editor persona page still promises a separate connection for each different persona even when two personas declare the same role. Severity: 5/10

Existing Risk: 5/10 - A reader follows the documented web-tools opt-in and gets a persona load error, or expects two independent editor connections and misreads the shared role-backed row and its transcript.

Proposal Risk: 2/10 - The pages will match the delivered role format and role-keyed slots, and the change is documentation-only with no runtime behavior to regress.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "update user docs for role-backed personas". In documentation/user-documentation/automation/monitoring.md replace the "Persona web tools" section with the delivered behavior: a persona's first line is `[//]: # role: <role>`, the role's command grants configure its tools through the shared core ACP path, a leftover `[//]: # tools:` line is ordinary prompt text, and a missing or malformed directive fails with the exact error `Persona "<name>": expected first line [//]: # role: <role>.`. In documentation/user-documentation/tab-types/editor-persona-query.md correct the connection paragraph to say the slot is keyed by the persona's declared role, so two personas naming the same role share one connection while differing roles open separate connections, and the row keeps naming the persona the user typed. Keep product/specs/monitoring.md and product/specs/editor-tab.md as the source of truth for the wording and do not change any code or test. Verify by reading both pages against those spec files and confirming no old directive, web-tools allowlist, or "different persona gets its own connection" claim remains.


* Reset the launcher capability's remembered role when its ACP session is reset

Existing Issue: The `role` captured by `acpCapabilities` from an earlier `startAcp({ role })` survives `resetAcp`, so a later `startAcp` with no role starts under the stale role instead of the documented `ask` default and `promptAcpResult` keeps prompting under it. Severity: 4/10

Existing Risk: 4/10 - A plugin that resets its tab and restarts without naming a role silently reuses the old model and grants, contradicting the published default and prompting under a role the caller did not choose.

Proposal Risk: 2/10 - Resetting the captured value on `resetAcp` restores the documented default; the launcher always passes an explicit role, so its behavior is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "reset the remembered ACP role on resetAcp". In src/plugins/acp-capabilities.ts set the captured role back to `DEFAULT_ACP_ROLE` inside the `resetAcp` capability after closing the tab, so the next `startAcp` with no request and the following `promptAcpResult` both use `ask`. Keep the additive optional `role` field on `startAcp` in src/plugins/api.ts and the documented default in product/specs/acp.md unchanged. Add a case to src/acp/plugin-session.test.ts that starts a capability under a custom role, calls `resetAcp`, starts again with no request, and asserts both `managers.acp.start` and `promptAcpResult` receive `ask`; keep the launcher's explicit-role tests passing.


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
