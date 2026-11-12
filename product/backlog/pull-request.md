<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the agent-command spec and page's claim that a remote run's workspace step appears in monitor activity, which the implementation writes only to the connection record.

Existing Issue: `product/specs/agent-command.md` says a remote run's workspace step is tagged `[<host>] ` on both monitor and record activity lines, and `documentation/user-documentation/advanced-agents/agent-command.md` says it starts its activity line, while `src/agent/execute.ts` writes each step only through `run.record?.activity(...)` and `AgentRun.reportActivity` in `src/agent/run.ts` is the only path that fills `run.activity`, which `web/src/plugins/agent-monitor/view.tsx` renders, so the monitor never shows the step at all. Severity: 5/10

Existing Risk: 4/10 - A user watching a remote run's monitor looks for the tagged `file read` step and never sees it, and the spec keeps the next reader looking at a surface that does not show the loop's tools.

Proposal Risk: 1/10 - The spec and page would describe the connection record that already carries both tagged lines, but the monitor would still omit the step, so the product decision remains visible rather than hidden.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "correct the agent-command monitor tagging claim". Compare the two documents with the two display paths before editing. `src/agent/execute.ts`'s `startCommand` and `ranCommand` handlers call only `run.record?.activity(...)`, and `AgentRun.reportActivity` in `src/agent/run.ts` is what pushes to `run.activity`, the array `web/src/plugins/agent-monitor/view.tsx` renders; the far-side `acp-tool-step` path in `src/remote/acp-session-run.ts` reaches those same handlers, so no loop step reaches the monitor. Change `product/specs/agent-command.md` to say the tag appears on both `tool` activity lines in the connection record, and change `documentation/user-documentation/advanced-agents/agent-command.md` to drop the monitor claim and keep the record wording. Do not change the core-tab tagging in `src/acp/run-prompt.ts` or its tests. If the monitor is later required to show the step, route both tagged calls through `run.reportActivity('tool', tagged(...))` in `src/agent/execute.ts` (which also writes the record) and add a remote-run assertion on `run.view().activity` for both `[<host>] ...` lines; that is a separate behavior change, not this documentation correction.


* Update the ask, tell, and roles help pages, which still describe the pre-file-read default grant sets and the nine-command tell role.

Existing Issue: `help/ask.md` lists only databases, browsing, and questions for the default ask role, `help/tell.md` says the default tell role has "all nine native commands" and omits `file read`, and `help/roles.md` says ask can query databases, browse pages, and ask or approve questions, while `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` grants `file read` to ask and grants tell all ten commands in `NATIVE_ACP_COMMANDS`. Severity: 4/10

Existing Risk: 4/10 - A user reading `help tell` or the roles help page sees a grant set that contradicts the roles tab and may not know the agent can read workspace files.

Proposal Risk: 1/10 - The help pages and the roles defaults agree after the edit, and the generated command-reference page still needs the normal docs rebuild, which is expected rather than a hidden risk.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "update the ask, tell, and roles help pages for the file-read grants". Add reading a file from the workspace to the default ask summary in `help/ask.md`; change "all nine native commands" to "all ten native commands" and add `file read` to the list in `help/tell.md`; add the same file-read grant to the default-role summary in `help/roles.md`. Use `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` and `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` as the source of truth, and leave `help/file.md`, the `file` row in `help/commands.md`, and the generated `documentation/user-documentation/command-reference/` page alone. Verify by grepping `help/` for `nine native commands`, comparing all three pages with the two constants, and running the docs build so the generated reference reflects the edited pages.


* Correct the ACP spec's secret-path rule, which limits `SECRET_DENY_PATHS` to the real home even though the reader refuses those segments anywhere in the workspace.

Existing Issue: `product/specs/acp.md` says a `.env` or `.env.*` file, or a path matching a run in `SECRET_DENY_PATHS` under the real home directory, returns `Secret file`, while `src/file-read/read.ts` also rejects any workspace-relative path whose segments contain a `SECRET_DENY_PATHS` run, and `help/file.md` already describes credential locations such as `.ssh`, `.aws`, and `.gnupg` as refused anywhere in the workspace. Severity: 3/10

Existing Risk: 3/10 - A developer relying on the spec can assume a workspace `.ssh` or `.aws` path is readable and narrow the reader to match the sentence later.

Proposal Risk: 1/10 - The spec and the help page agree on the workspace-wide rule, and the reader keeps enforcing it; the only remaining risk is a future divergence between the two documents.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "correct the ACP spec's secret-path scope". In `product/specs/acp.md`'s `### File read` containment paragraph, state that a `.env` or `.env.*` file and any path containing a run from `SECRET_DENY_PATHS` are refused anywhere in the workspace, and that a path under the real home matching the same table is also refused; keep `Secret file: <path>.` and the typed-path rule verbatim. Use `isSecretPath` and `isUnderHomeSecret` in `src/file-read/read.ts`, `SECRET_DENY_PATHS` in `src/sandbox/paths.ts`, and the credential-location list in `help/file.md` as the cross-check. Do not change the reader or its tests; `src/file-read/read.test.ts` already pins the workspace secret cases.
