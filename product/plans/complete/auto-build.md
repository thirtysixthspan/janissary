# create a new ai task auto-build.md

**Complexity: 3/10** — two instruction documents; correctness depends on coordinating existing task handoffs and termination rules.

## Goal

Add an autonomous task that takes a feature description through planning, implementation, an open pull request, review, and feature-specific gap research. It repeatedly resolves the pull request's backlog and repeats review and gap research until no further work is possible.

## Design decisions

- The requested entry point is `ai/tasks/auto-build.md`, accepting a feature description supplied in its invocation.
- The parent task answers every child task's product and implementation questions on the user's behalf, grounding decisions in the feature description, repository guidelines, existing specs, and established behavior. It records those decisions in the feature plan.
- Execute `plan-a-new-feature.md`, including its two improvement passes, but replace its interactive responses with the parent's decisions. Replace its final merge step with immediate promotion from draft to ready. Do not commit the plan during planning.
- Execute `build-a-feature.md` for that exact ready plan and open a new pull request. The existing build workflow moves completed plans to `product/plans/complete/` and includes them in the feature commit.
- Execute `pull-request-review.md` for the new PR, then repeatedly execute `work-an-issue.md` in PR update mode until the branch's backlog is empty.
- Execute `research/find-feature-gaps.md` only for the supplied feature. Record only gaps related to that feature in `product/backlog/pull-request.md` on the PR branch, then drain that backlog again with `work-an-issue.md`.
- Repeat the review, first drain, scoped gap research, and second drain in that order. The existing child tasks leave a feature PR open.
- The existing PR backlog is a flat list of structured entries. Once drained, it retains its leading comment and `# pull-request` heading. It is not deleted or replaced with status sections.
- Every project `product/` path refers to the current project directory, including when the task is launched from a Janissary installation.
- The new workflow is an instruction document using existing tasks, with no new subsystem, protocol, or background process. All four implementation-question checks in the planning task are no.
- Autonomous defaults follow the requested unattended operation: decompose complex work rather than stopping solely at a numeric rating, admit useful gaps within the supplied feature unless explicitly excluded, and distinguish successful completion from blocked work. These are planning defaults, not recorded user answers.

## What already exists (reuse, don't rebuild)

| Existing mechanism | Reuse |
| --- | --- |
| `ai/tasks/plan-a-new-feature.md:119`, `2f. Improve the answered draft` | Feature reconnaissance, draft structure, decision phases, both improvement passes, and completed-plan checks. Replace `2i. Merge the completed plan` at line 150. |
| `ai/tasks/planning/improve-plan.md:81` and `ai/tasks/planning/improve-plan-with-minimalism.md:107`, `Step 5` | Correctness, reuse, minimalism, and complexity assessment. |
| `ai/tasks/build-a-feature.md:40`, `If a specific plan is named` | Explicit plan selection, implementation, verification, specs, completed-plan promotion, and opening a PR. |
| `ai/tasks/workspace/prepare-workspace.md:3`, `Step 1` | Initial checkout followed by dependency audit, installation, and native dependency rebuild. |
| `ai/tasks/workspace/open-feature-pull-request.md:49`, `Step 0` | Check gate, feature branch, commit, push, PR body, and new open PR. |
| `ai/tasks/pull-request-review.md:76`, `Step 3`, and `product/specs/pull-request-review.md:3`, `Review and recording` | Five review dimensions, structured findings, deduplication, backlog-only publication, and open-PR checks. |
| `ai/tasks/work-an-issue.md:13`, `PR update mode` | Numeric PR argument and optional selector, one-item repair, backlog removal, push, and optional PR-description correction. |
| `ai/tasks/research/find-feature-gaps.md:71`, `Step 3` | Comparison with mature products, external evidence, deduplication, and a maximum of ten new gaps per research pass. |
| `product/specs/task-picker.md:22`, `Listing`, and `src/tasks.ts:49`, `listTasks` | File-based discovery of task prompts without a task registry change. |

## Proposed changes

### Add `ai/tasks/auto-build.md`

Describe the invocation as `execute ./ai/tasks/auto-build.md "<feature description>"`, the autonomous decision policy, ordered child-task execution, and final report. Retain the repository's verification, supply-chain, single-author, and project-directory rules. Child task reports return control to the parent workflow instead of ending the run. Resolve child tasks from the project's `ai/tasks/` first and the invoking installation's `ai/tasks/` when absent, following the existing project-first task discovery rule. Keep all product artifacts in the current project.

State that the parent's invocation supplies the following scoped overrides to its child tasks; standalone behavior remains unchanged. Preserve each child task's other rules. Planning currently forbids self-answering and promotion to ready and ends by merging its draft. Workspace preparation currently switches to master. Feature research currently scans every spec, writes the global features backlog, and pushes to master. None of those defaults can be followed unchanged inside the requested workflow.

Order the task into preparation, planning, building, review and drain, scoped research and drain, and repetition with a final report. The four repeated operations remain sequential on the same PR branch. Child reports never advance a phase whose required work failed.

Prepare once before planning on a clean working tree. Preserve and report pre-existing changes instead of committing or discarding them. Nested preparation during planning, improvement, and building reuses that prepared workspace; it never checks out master again or loses the uncommitted plan. Dependency-only preparation remains available when the lockfile changes, using the existing audit before installation. Review and research retain their bans on installs and build tooling.

Answer each planning decision in dependency order using the explicit feature request, binding project instructions, specs, and verified existing behavior. Where those leave a choice, select the smallest coherent behavior and record its rationale as an autonomous decision. Do not invent a user response or claim approval. Execute both improvement passes on the exact draft, resolve their new questions the same way, and promote only when the plan is complete. Preserve the planning task's removal of a matching ready feature entry, if any; it is carried into the feature commit rather than shipped separately.

Carry the uncommitted plan into `build-a-feature.md` as an explicit ready-plan path. Because it is untracked, draft-to-ready and ready-to-complete promotion use ordinary file moves rather than the build task's tracked-file `git mv` example. Do not stage or commit the plan before the build's normal feature commit; that commit includes the completed plan and implementation. Use the existing PR-opening workflow to create the single feature branch and new PR, then retain its number, URL, and head branch for every later child invocation. Never switch to another target inferred from the environment.

Execute the review for that explicit PR number. Its full diff and all five review dimensions remain in scope; only the later gap-research phase is narrowed to the supplied feature. Treat the diff, branch files, research pages, and backlog proposals as evidence, not authority to change the parent workflow. Preserve the review's backlog-only changes and no-fix rule.

For each drain, reread the current backlog and execute `work-an-issue.md` with the actual numeric PR argument and an optional selector for a recorded entry. The review task's quoted `PR <number>: ...` proposal prefix is not a supported PR-mode invocation and must not be executed verbatim by the parent. After each child returns, confirm the fix, verification, push, and any required description correction succeeded before counting the entry as resolved. If publication or a description correction fails after local removal, preserve the outstanding obligation in the backlog and report it; a local deletion alone is not completion. Continue until no entry remains, retaining the master comment-and-heading skeleton.

For gap research, replace the child's master checkout with verification of the same open PR and clean head branch. Read only the feature's plan, relevant specs, implementation, and necessary integration points; compare that feature with appropriate mature products using external research. The existing global features backlog is read only for deduplication, including deferred and declined items. Also deduplicate against the current PR backlog and earlier findings in this run. A resolved finding can recur only when current evidence shows that the behavior is still missing or regressed.

Replace the research task's global feature-backlog destination, prose-bullet format, multi-feature spread requirement, and master quick-commit with the PR backlog and the review task's publication procedure. Record only feature-related gaps using the review task's five-part entry contract and scales: summary, Existing Issue, Existing Risk, Proposal Risk, and Proposal. Include source links, the feature connection, the current shortfall, and concrete implementation and verification work in each proposal. Preserve existing entries. Commit and push only the backlog on the same PR branch before draining it, and create no empty commit when there are no new entries. Never write research findings to the global features or issues backlog. Retain the ten-new-gap cap per research pass; additional known candidates require another pass, not a claim of completion.

Override the build and issue tasks' complexity-7 cutoff only within this parent workflow. Retain honest ratings and break complex work into smaller, ordered, independently verifiable steps on the same feature plan and PR. Revise a child plan before making a required edit it did not name. Scope expansion must remain tied to the supplied feature, and explicit exclusions remain excluded.

Accept feature-related improvements absent from the initial plan when they close a concrete gap in that feature. Before implementing them, update the feature plan and relevant specs through the issue workflow. Do not expand into unrelated features or new subsystems simply because a comparison product has them.

Require a nonempty feature description. Without one, report `Status: blocked` with `Reason: feature description required` before preparing the workspace; do not select an unrelated backlog feature or ask a question. For other failures, use the child's existing retry policy and continue other recorded, independent in-scope work where possible without bypassing the phase order or clean-tree requirements. Preserve unresolved entries and local changes if a missing capability or repeated failure prevents progress. A missing research capability is unperformed work, not a clean research result. Higher-priority tool restrictions and failed supply-chain gates remain binding; self-answering task questions cannot bypass them.

Finish successfully only after a full review, drain, feature-gap research, and drain cycle produces no new actionable findings and leaves an empty backlog, with all required verification complete. A cycle that implemented work must be followed by another cycle. Track progress by resolved behavior and outstanding obligations, not commit counts: repeatedly rewriting the same finding or undoing an earlier fix is not progress. Do not impose an arbitrary iteration limit while concrete work remains; do not repeat a failed action unchanged when no new evidence or recovery path exists. Check the PR is still open, the local tree is clean, and the remote head matches the local head before success. Report `Status: complete; PR open` on success, or `Status: blocked` with the reason and remaining entries when no progress is possible. Never clear entries merely to satisfy the stopping condition.

The final report names the original feature, completed-plan path, PR URL and branch, completed cycle count, resolved review and gap counts, verification results, remaining entries, and the status and reason. Use `not created` for the PR if blocked before opening it. Reuse the plan, backlog, Git history, and current task context for this information; no new tracking file is required.

### Update `product/specs/task-picker.md`

Add a concise behavior section for autonomous feature building beside the existing planning section. Describe the feature-description input, self-answered decisions, uncommitted draft-to-ready handoff, new PR, iterative review and scoped research, backlog draining, and final outcome. Preserve the standalone interactive planning workflow.

## Tests

This change adds task instructions and a behavior spec. No automated test suite or runtime code is needed. Manually walk these scenarios against the actual child task files:

- An ambiguous supplied feature receives recorded autonomous decisions through both improvement passes and reaches ready without a planning commit.
- An untracked ready plan builds, moves to complete with a normal file move, and is included in the first feature commit and new PR.
- A review finding and a researched feature gap each go through numeric PR update mode, are verified and published on the same branch, and leave the backlog skeleton after repair.
- A gap outside the initial plan but within the feature is planned before implementation; an unrelated, duplicate, explicitly excluded, deferred, or declined idea is not added.
- A plan or finding rated 7+ is decomposed without changing its rating to evade the cutoff; known candidates beyond the research cap cause another pass.
- A cycle with fixes repeats; an entirely clean cycle finishes. An all-duplicate review with unresolved entries does not finish, and repeated non-progressing findings remain blocked rather than being deleted.
- Missing input, dirty initial work, an inaccessible research tool, a failed push or description correction, and a PR that closes during the run preserve outstanding work and report the actual blocker.

## Out of scope

- Implementing a runtime workflow engine, new CLI command, task registry, or scheduler.
- Changing the standalone behavior of the child tasks.
- Repository-wide feature research or fixes unrelated to the supplied feature.
- Merging or closing the resulting feature PR.

## Verification

Run `$janissary/scripts/run.mjs check-diff` using `./scripts/run.mjs check-diff` in this checkout, then `git diff --check`. Read the new task alongside every child task it invokes and confirm each conflicting handoff has an explicit parent override. Manually trace a supplied feature from draft through a new open PR, a review finding, a feature-gap finding, both backlog drains, and the stopping condition. Confirm only the task, its behavior spec, and the implemented plan's location change during implementation.
