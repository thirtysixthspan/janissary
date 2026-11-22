<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's plan-first summary cleanly by removing the open-feature task's contradictory "thorough and self-contained" body requirement.

Existing Issue: The open-feature task still states as absolutes that the PR body "must be thorough and self-contained" so a reviewer understands the feature without reading code, and that the PR should be opened "with a thorough description", while the plan-first summary mode added to that same document deliberately writes only a short `### What`, `Plan:` and optional `Subplans:` with none of Behavior examples, Screenshots or How to verify. Severity: 3/10

Existing Risk: 4/10 - A subagent running plan-first mode meets the absolute thorough-body rule before it reaches the mode-specific instruction and may author a full body at PR creation, defeating the plan's goal that no full description exists before the code is final.

Proposal Risk: 1/10 - The two statements then agree and the mode's explicit short-body rule governs; only prose changes, so there is no behavior or tooling to regress.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2173 "qualify the open-feature task's thorough-body rule so plan-first summaries are not required to be self-contained". In ai/tasks/workspace/open-feature-pull-request.md, qualify the two opening statements in the preamble and "The PR description" section — the "It must be thorough and self-contained — a reviewer should understand the feature without reading the code" sentence and the "just open it with a thorough description" clause — so they apply to the default full-body mode only, and add a sentence saying that in plan-first summary mode the body is intentionally a short plan summary whose full form is authored later by ai/tasks/feature/update-pull-request.md. Keep the "Two body modes" section, the short-summary template, the Step 5 mode branch and the Step 7 skip unchanged. No other file changes are needed; no test covers this prose, so verify by reading that the default full-body requirements still bind ordinary PRs while plan-first mode is no longer subject to them.
