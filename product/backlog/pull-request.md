<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's "After" behavior example so its pinning test is a real existing test.

Existing Issue: The "After" example offers a preserved-behavior entry pinned by `src/tab/__tests__/navigation.test.ts` "cycles tabs without reordering", a path and test that do not exist, while the new template rule says an entry must name an existing test that pins the behavior. Severity: 5/10

Existing Risk: 5/10 - A reader copies the example into a plan and names a test that does not exist, which the plan's own rules say must instead become a normal requirement, leaving the change's showcase unverifiable against the code.

Proposal Risk: 2/10 - The example points at a real test that pins tab ordering, so it can be checked against the repo, while no workflow rule or edited document changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2183 "correct the behavior example's non-existent pinning test". In the pull request body's Behavior examples section, replace the "After" entry's `src/tab/__tests__/navigation.test.ts` "cycles tabs without reordering" reference with an existing test in `src/tab/` that pins tab ordering (for example a test in `src/tab/reorder.test.ts`), quoting that test's real name so the entry satisfies the new rule that an entry names an existing test; if no single existing test pins that behavior, relabel the transcript explicitly as hypothetical. Leave the Before/After contrast and the rest of the description unchanged. Verify by opening the named test file and confirming the quoted test exists, and by reading the rewritten example against the `### Preserved behavior` rules in `ai/guidelines/plan-template.md`.


* Deliver the plan's no-backfill decision without leaving the template's own section rule contradictory.

Existing Issue: The template's section overview states "Every section is required in every plan" while the newly added Preserved behavior subsection says the section is required only in plans authored after its introduction and that existing plans in `ready/`, `complete/`, or `deferred/` are not backfilled. Severity: 5/10

Existing Risk: 5/10 - An improver working on an existing plan reads the global rule and backfills the section against the plan's explicit no-backfill decision, so the single owner of plan shape gives two contradictory answers depending on which paragraph the reader stops at.

Proposal Risk: 2/10 - A single qualification in the template makes the carve-out explicit and consistent, with no change to the section list, the section order, or any consuming task.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2183 "reconcile the template's conflicting section-requirement rules". In `ai/guidelines/plan-template.md`, qualify the "Every section is required in every plan" sentence in the `## Sections` overview so it states that the Preserved behavior section is required in plans authored after its introduction and that plans already in `ready/`, `complete/`, or `deferred/` are not backfilled, matching the carve-out in the `### Preserved behavior` subsection. Keep the ordered section list and subsection unchanged. Verify by reading the overview next to the Preserved behavior subsection and confirming both give the same answer for a plan in each status directory, and by confirming `ai/tasks/feature/plan-a-new-feature.md` and `ai/tasks/planning/improve-plan.md` still defer to the template rather than restating a conflicting rule.


* Refresh the promoted plan's stale anchors so it remains a trustworthy plan-fidelity source of truth.

Existing Issue: The plan promoted by this PR cites `path:line` anchors that now land on the wrong sections because the PR inserted lines into four of the five documents it anchors, so the anchor for `### Existing functionality` now points at `### Assumptions` and the review-task anchors now point at blank lines. Severity: 5/10

Existing Risk: 5/10 - A reader following an anchor from the source-of-truth plan lands on the wrong section or a blank line, and the "Wrong or stale references" check in `ai/tasks/planning/improve-plan.md` would flag the very plan the PR tells readers to trust.

Proposal Risk: 2/10 - The anchors are corrected to the lines carrying their quoted fragments, and no rule, section, or edited document changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2183 "refresh the promoted plan's stale line anchors". In `product/plans/complete/preserved-behavior.md`, update every `path:line` anchor whose target moved when the PR's five documents gained lines: both anchors into `ai/guidelines/plan-template.md` that name the `### Existing functionality` heading and its "None found" sentence, the `ai/tasks/feature/plan-a-new-feature.md` anchor naming the "Before moving on, check the completed plan against this list:" checklist, and both `ai/tasks/feature/review-pull-request.md` anchors naming the "### Walk the promises" heading and the Plan fidelity bullet. Keep each quoted identifier unchanged, leave the `ai/tasks/planning/improve-plan.md` and `ai/tasks/planning/decompose-plan.md` anchors that did not move as they are, and verify each by opening the named line and confirming the quoted fragment is present, as `ai/tasks/planning/improve-plan.md` Step 3 requires.
