<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request title that labels this a documentation plan-decomposition change when the diff implements the entire subagent feature.

Existing Issue: The title is "docs(subagent): decompose implementation plan" while the diff adds the subagent command across the server, client, specs, help, and documentation, so a reader judging scope from the title expects a docs-only change. Severity: 4/10

Existing Risk: 4/10 - Reviewers, release notes, and changelog readers treat a large feature as a trivial docs edit, so the change gets the wrong level of scrutiny and lands mislabeled in project history.

Proposal Risk: 1/10 - The title then describes the shipped change accurately; no code or behavior is touched, so a regression is possible only in the wording choice, which a human reviews directly.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "retitle the pull request to describe the implemented feature". Retitle PR #2064 from "docs(subagent): decompose implementation plan" to a Conventional-Commits title that reflects the delivered feature, for example a feat(subagent) title naming the command, its delivery, and its remote lifecycle. Leave the body unchanged: it already describes the implementation accurately, including the invocation forms, records, delivery queues, human replies, and remote clone lifecycle, so no description edit is needed. Verify the new title by reading it back with gh pr view; do not change any file, run any tooling, or merge or close the pull request.


* Reconcile the stale native-command counts in the subagent specs so they match the eighteen-command vocabulary this pull request ships.

Existing Issue: The subagent paragraph this pull request adds to product/specs/application-commands.md says the native vocabulary has fifteen commands, and the file-patch paragraph in product/specs/acp.md still says the built-in tell role grants seventeen, while the shipped vocabulary has eighteen and three sibling docs updated by this pull request say eighteen. Severity: 3/10

Existing Risk: 3/10 - A reader or a downstream task trusting the spec's count misjudges the role grants and command inventory, and contradictory numbers across the spec set erode confidence in the documentation this pull request delivers.

Proposal Risk: 1/10 - Only prose counts change, with no code path or behavior affected; the only residual risk is a fresh miscount if the vocabulary changes again, which stays visible by comparison against the source list.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct stale native-command counts in the subagent specs". In product/specs/application-commands.md, change "The native vocabulary has fifteen commands" to eighteen in the subagent paragraph. In product/specs/acp.md, change the file-patch paragraph's "the built-in tell role grants it by default with seventeen commands" to eighteen; the file-read paragraph in the same file already says eighteen after this pull request. Cross-check the target number against NATIVE_ACP_COMMANDS in src/plugins/roles/shared.ts, which lists eighteen entries (master's seventeen plus subagent), and against the "eighteen" already stated in product/specs/roles.md, help/tell.md, and documentation/user-documentation/tab-types/roles.md. Make no code changes; verify by re-reading the edited spec paragraphs and confirming all four documents agree on eighteen.
