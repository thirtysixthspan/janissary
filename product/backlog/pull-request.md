<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the description's and plan's claim that a bracketed ssh alias is imported with its own stored values.

Existing Issue: The description's edge-case 10 and the plan's verification step 6 say a bracketed `Host [::1]` alias takes its own values after Import, but the import path validates every alias name with validateHostFields, whose name pattern admits only letters, digits, dot, underscore and hyphen, so the bracketed alias is skipped and no row is written. Severity: 5/10

Existing Risk: 5/10 - A reviewer or user following the documented verification sees the bracketed alias silently omitted and concludes the import dropped its settings, while the promised user-visible outcome cannot be produced by the shipped code.

Proposal Risk: 2/10 - The reader already resolves the bracketed alias's own settings, and aligning the wording with that behavior leaves only a documentation reconciliation to keep in step.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "correct the claim that a bracketed ssh alias is imported with its own values". The description's edge-case 10 and the verification steps of product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md promise that a bracketed `Host [::1]` alias takes its own stored values after Import, but importSshHosts in src/plugins/hosts/import-ssh.ts passes each alias name and effective destination to validateHostFields in src/plugins/hosts/hosts-values.ts, whose NAME_PATTERN rejects brackets and colons, so acceptedHost returns undefined and the alias is counted as skipped. Decide which behavior is intended. If the current behavior is intended, rewrite that description example and the plan's verification step to say the reader resolves the bracketed alias's own HostName, User and Port, as readEffectiveAliases in src/plugins/hosts/ssh-config/parse.ts and its bracketed-name cases in src/plugins/hosts/ssh-config/parse.test.ts already prove, but Import skips it because its name and destination fail the saved-host rules; add a case in src/plugins/hosts/import-ssh.test.ts pinning that skip with the incremented skipped count. If importing bracketed names is intended instead, extend the catalog name and destination validation in src/plugins/hosts/hosts-values.ts and update its callers and tests, then keep the present wording. Leave the escaping and complexity caps in src/plugins/hosts/ssh-config/parse.ts and src/plugins/hosts/ssh-config/pattern-limits.ts unchanged; their tests already cover those paths.


* Correct the description's Screenshots claim, which names no code path or test that supports it.

Existing Issue: The description's Screenshots section states that no screenshot could be captured and attributes that to the task workflow, without naming any code path, line, or test assertion that proves the claim. Severity: 2/10

Existing Risk: 2/10 - A reader cannot check the claim against the code, so the section conveys nothing verifiable about the new buttons and leaves the UI change resting on unanchored prose.

Proposal Risk: 1/10 - The UI behavior remains covered by the component tests, and the description would either point at them or drop the unverifiable statement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "anchor or remove the description's screenshots claim". The description's Screenshots section says no screenshot could be captured because this was a plan-first pull request and the update task never starts the app, and names no code path or test assertion. Replace that paragraph with an anchor to the component cases that prove the two buttons' labels, icons, placement and empty-state visibility in web/src/plugins/hosts/HostList.test.tsx, or remove the section entirely if no screenshot is supplied. Keep the Behavior examples and How to verify sections unchanged, since their lines already name their code paths and test assertions. No source file needs to change.
