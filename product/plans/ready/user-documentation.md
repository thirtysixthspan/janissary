# Keep user documentation out of feature pull request reviews and plans

**Complexity: 4/10** — ~40 added lines across 6 playbooks and 15 requirements (p=5.17); no new units or test scenarios.

## Goal

The feature is named "user documentation" and was supplied at task invocation without a matching backlog entry, but the user settled its goal as "documentation changes are not part of pull request reviews or plans". It aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description. Prose documentation under `documentation/user-documentation/` and `documentation/developer-documentation/` should be excluded from feature pull request reviews and from feature plans, while specs under `product/specs/` and in-application help under `help/` stay in scope. The exclusion lifts only when the pull request or plan is itself about documentation. The change updates the agent task playbooks that encode these rules so the boundary is explicit and consistent.

## Requirements

1. "a missing or stale page under `documentation/user-documentation/` or `documentation/developer-documentation/` is not a finding on a feature pull request and must not be written into the backlog" (feature text).
2. "specs under `product/specs/` and in-application help under `help/` are in scope and a stale one is still a finding" (feature text).
3. "when the pull request's own plan and title are about adding or updating user or developer documentation, those trees become the primary scope and reviewers judge them as carefully as code" (feature text).
4. "the distinction is about what the pull request *is*, not about what its description mentions — a feature PR that happens to describe a user-visible change does not become a documentation PR" (feature text).
5. Every one of the six playbooks states the canonical phrase "User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan." (settled user answer).
6. A repair performed by `work-pull-request-issue.md` updates in-application help when the fix changes a command or key binding (feature text).
7. That repair does not edit `documentation/user-documentation/` or `documentation/developer-documentation/` as a drive-by (feature text).
8. A recorded finding that asks for those files is removed from the pull request backlog (settled user answer).
9. That finding is added as a ready item to `product/backlog/documentation.md` for `update-documentation.md` to own, and reported as out of scope (settled user answer).
10. `update-pull-request.md` keeps `documentation/` out of its Allowed list (feature text).
11. Step 6 of `update-pull-request.md` states the reason for that exclusion using the canonical phrase (feature text and settled user answer).
12. `build-a-feature.md` states that a feature plan names only the specs and help pages it touches and never the two documentation trees (feature text and settled user answer).
13. `improve-plan.md` states the same boundary for the plans it improves (feature text and settled user answer).
14. `plan-a-new-feature.md` asks a scope-boundary question for user-visible changes so the plan records the documentation update as a separate feature rather than silently omitting it (feature text).
15. No other rule in the six playbooks still grants a feature pull request or feature plan permission to edit the two documentation trees (feature text).

## Design decisions

- User-facing docs live in `documentation/user-documentation/` and are rewritten from the specs in `product/specs/` for a reader who has never seen either (`ai/guidelines/user-documentation.md` "Writing User Documentation").
- In-app command help lives in `help/`, and the docs site's Command Reference pages are generated from those sources rather than edited directly (`ai/guidelines/documentation.md` "Help Command Table").
- The docs site is a VitePress build; `documentation/.vitepress/config.mts` registers sidebar pages and copies agent sprite facings at build time (`ai/guidelines/documentation.md` "Source images" and "Build pipeline").
- `ai/tasks/update-documentation.md` is the existing automation that works items from the `ready` queue in `product/backlog/documentation.md` and restricts itself to documentation files.
- The user settled the scope at exactly the six playbooks named in the feature text. The other fix tasks that also mention user docs (`work-an-issue.md`, `resolve-technical-debt.md`, `fix-a-bug.md`) are explicitly out of scope.
- Although the feature text asks to "reverse the earlier instruction that put user documentation on the feature plan's checklist" in `build-a-feature.md` and `improve-plan.md`, no such instruction exists on current master. The user chose to add an explicit no-user-docs rule to both files rather than skip them.
- A documentation finding already recorded on a feature PR is refiled: `work-pull-request-issue.md` removes it from the pull request backlog and adds a ready item to `product/backlog/documentation.md` for `update-documentation.md` to own.
- The canonical phrase chosen by the user is "User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan." It is reused verbatim in all six playbooks instead of restating the boundary in different words.

## Assumptions

1. `ai/guidelines/user-documentation.md:3` establishes "`documentation/user-documentation/`" as the user-facing docs surface, distinct from the internal specs.
2. `ai/guidelines/developer-documentation.md:3` establishes "`product/specs/`, `product/plans/`, `ai/guidelines/`" as the contributor-facing docs.
3. `ai/tasks/update-documentation.md:5` establishes that "`The backlog is a general documentation work queue`", so a ready item may be as terse as one sentence and needs no score.
4. `ai/tasks/update-documentation.md:7` establishes "This task edits **documentation files only**" for the existing doc-update automation.
5. `ai/guidelines/plan-template.md:47` establishes "Tests of documentation should not be introduced", so this change adds no tests.
6. `ai/tasks/feature/review-pull-request.md:30` establishes the current Forbidden rule "Never edit a source, test, spec, config, plan, or documentation file", which the new scope rule must not contradict.
7. `ai/tasks/feature/update-pull-request.md:31` establishes the existing exclusion "`documentation/`, `README.md`, `AGENTS.md`, and `ai/guidelines/` are outside the list too".

## Existing functionality

1. `ai/tasks/update-documentation.md:3` provides the mechanism that takes "the first item from the `ready` section of `product/backlog/documentation.md`" and works it.
2. `ai/tasks/research/find-user-documentation-gaps.md:3` provides the survey that "Add[s] **only actionable documentation gaps**" to `product/backlog/documentation.md`.
3. `ai/guidelines/documentation.md:87` provides "The **Commands** table in `help/commands.md` is kept in alphabetical order by command name", which the repair task's help-only step follows.
4. `ai/tasks/feature/review-pull-request.md:110` provides the "Follow each change past the edge of the diff" paragraph where the new review scope rule is repeated.
5. `ai/tasks/feature/work-pull-request-issue.md:111` provides the "Step 6 — Update help and public documentation if affected" section that is narrowed to help only.
6. `ai/tasks/feature/update-pull-request.md:119` provides the "Step 6 — Update help pages" section where the exclusion reason is made explicit.
7. `ai/tasks/feature/plan-a-new-feature.md:100` provides the "2d. Phase 1 — resolve product decisions" categories where the new scope-boundary question belongs.

## Implementation steps

Edit the six playbooks in this order, so each step is self-contained and no rule is left contradicting another.

First edit `ai/tasks/feature/review-pull-request.md`. Add an explicit scope rule near the top, placed among the framing rules that precede "What you may and may not do", stating the canonical phrase and the feature-text boundary: a missing or stale page under either documentation tree is not a finding on a feature pull request and must never be written into the backlog, while specs and in-application help remain in scope and a stale one is still a finding. State the re-enabling condition there too: only when the pull request's own plan and title are about adding or updating user or developer documentation do those trees become the primary scope, judged as carefully as code. Say explicitly that the distinction is about what the pull request is, not what its description mentions, so a feature PR that describes a user-visible change does not become a documentation PR. Repeat the same boundary and canonical phrase in the "Follow each change past the edge of the diff" paragraph in Step 3, which currently lists specs, help pages, and docs together as things to check, so a reviewer is told at the point of action that the two documentation trees are excluded. Leave Step 2's promise list untouched; its item for "each spec and documentation edit it calls for" is governed by the new top rule, which decides from the pull request itself whether a missing page is a finding. Leave the Forbidden rule against editing files untouched.

Second edit `ai/tasks/feature/work-pull-request-issue.md`. Change the opening job statement, which currently promises to "update affected specs and existing documentation", so it promises specs and applicable help only. Narrow the "Allowed" list at the top so the repair edits source, tests, CSS, specs, and applicable help pages, but no longer edits existing user documentation. Rewrite Step 6 as a help-only step: check `help/commands.md`, the matching `help/<command>.md` page, and `help/keys.md` for changed commands, flags, and key bindings; do not edit `documentation/user-documentation/` or `documentation/developer-documentation/` as a drive-by. Add the refiling behavior to the step that promotes the plan and removes the resolved entry: when a recorded finding asks for a change under either documentation tree, remove it from the pull request backlog, append a ready item describing the documentation work to `product/backlog/documentation.md` in that file's existing bullet style, and include the canonical phrase in the report as the reason it was not implemented. Update the report template's Docs line so it can name a refiled item rather than only a list of edited files.

Third edit `ai/tasks/feature/update-pull-request.md`. Keep `documentation/` in the Forbidden list and state the canonical phrase there as the reason, pointing at `update-documentation.md` as the owner. Make the reason explicit in Step 6, where the task already limits itself to the own plan, specs, and help: add a sentence saying that prose documentation is deliberately left out because it belongs to its own feature, using the canonical phrase, and that this step reconciles only the canonical plan, specs, and help with the final code. Leave the Allowed list and the report template otherwise unchanged.

Fourth edit `ai/tasks/feature/build-a-feature.md`. Add a statement, where the task describes what the promoted plan and its implementation must cover, that a feature plan names only the specs and help pages it touches and nothing from either documentation tree. Use the canonical phrase. Do not add a documentation page to any checklist; note that a user-doc gap found while building is a separate feature candidate.

Fifth edit `ai/tasks/planning/improve-plan.md`. Add the same boundary to the rules that govern what an improved plan may contain: a plan names the specs and help pages it touches and never a page under either documentation tree, and a user-doc gap is carried into the Open items of the report as a follow-up feature candidate rather than written as a plan requirement. Use the canonical phrase.

Sixth edit `ai/tasks/feature/plan-a-new-feature.md`. Add a scope-boundary question to Phase 1 for features with a user-visible change, offering concrete options for recording the documentation update as a separate feature rather than silently omitting it. State in the question that the plan records the documentation work as a follow-up feature candidate under the canonical phrase, and add a box to the final question checklist requiring that any user-visible change has this boundary recorded.

Finish by reading all six files together and checking that the canonical phrase appears in each and that no remaining sentence invites a feature review, plan, or repair to edit the two documentation trees.

## Tests

This change edits agent playbook markdown only. It adds no application code, no application behavior, and no test suite. No tests are introduced, per `ai/guidelines/plan-template.md`.

## Out of scope

- Editing `documentation/user-documentation/` or `documentation/developer-documentation/` themselves, or adding, fixing, or deleting any page in either tree.
- Editing `work-an-issue.md`, `resolve-technical-debt.md`, or `fix-a-bug.md`, even though they still tell agents to update user docs.
- Changing the `update-documentation.md` or `find-user-documentation-gaps.md` playbooks, the docs sidebar, the sprite pipeline, or the screenshot pipeline.
- Moving, renaming, or reformatting any of the six playbooks beyond the paragraphs and report lines described above.
- Changing the behavior of a pull request review beyond what it records as a finding.

## Verification

End with the diff-scoped check `$janissary/scripts/run.mjs check-diff`, which proves there is no lint, typecheck, or test regression, and note that this change touches no application code so the check is a guard against accidental edits elsewhere.

For the manual check, read the six playbooks straight through and confirm each of these claims: `review-pull-request.md` states the exclusion near the top and repeats it in the "Follow each change past the edge of the diff" paragraph, including the re-enabling condition for documentation PRs and the point that a description mentioning a user-visible change does not make a PR a documentation PR; `work-pull-request-issue.md` no longer lists user documentation as editable, its Step 6 is help-only, and its plan-promotion step refiles a documentation finding into `product/backlog/documentation.md`; `update-pull-request.md` keeps `documentation/` forbidden and gives the canonical reason in Step 6; `build-a-feature.md` and `improve-plan.md` each say a plan names only specs and help pages; `plan-a-new-feature.md` asks the new scope-boundary question and checks it in its final phase. A failure is any playbook that still permits a feature review, plan, or repair to edit either documentation tree, or any of the six that omits the canonical phrase.
