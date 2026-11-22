# Authorize the repair task's refiling of documentation findings

**Complexity: 1/10** — 0 production lines or files edited, 5 prose requirements, no test scenarios or new units (p=2.84); a scope-declaration prose alignment in one task file.

## Goal

The work-pull-request-issue repair task already requires a repair to refile a documentation finding — remove the resolved entry from the pull request backlog and append a ready item to the documentation backlog — but its opening job statement and Allowed list never name that write, so an agent honoring the declared scope can skip it. Extend the opening statement and the Allowed list to authorize the `product/backlog/documentation.md` append explicitly while keeping the ban on editing either documentation tree, so the declared scope matches the refiling step the task already carries. The documentation-backlog write is bookkeeping only.

## Requirements

1. "extend the opening job statement's enumeration to name that refiling" (Proposal).
2. "add `product/backlog/documentation.md` to the Allowed list as a file the repair may append a ready item to when a resolved entry asks for a change under `documentation/user-documentation/` or `documentation/developer-documentation/`" (Proposal).
3. "the documentation-backlog write is bookkeeping only, so state that explicitly beside the new allowance" (Proposal).
4. "Keep the exclusion intact: the repair still must not edit either documentation tree" (Proposal).
5. "Leave the report template's Docs line, which already names the refiled item, unchanged" (Proposal), and "verify by reading the opening statement, Allowed list, Forbidden list, and the refiling step together" (Proposal).

## Design decisions

- The fix is prose-only in `ai/tasks/feature/work-pull-request-issue.md`; it changes no application behavior and adds no code, so it introduces no tests and touches no spec, help page, or documentation tree.
- The existing Step 7 refiling paragraph already states the write, so this plan only makes the opening statement and Allowed scope declarations agree with it; that paragraph and the report template's Docs line stay byte-for-byte unchanged.
- Naming the write in the Allowed list keeps Forbidden rule 1 ("Editing files the fix does not touch ... do not silently expand scope") consistent: the append is now declared in scope, while every documentation-tree edit stays forbidden.
- The functional spec `product/specs/pull-request-review.md` already states that the repair "adds a ready item to the documentation backlog for the documentation workflow," so the behavior is already reflected and no spec edit is needed.

## Assumptions

1. `ai/tasks/feature/work-pull-request-issue.md:3` — the opening job statement enumerates "record the completed fix plan, remove the resolved entry when that is where it came from, and publish to that same branch" without the refiling.
2. `ai/tasks/feature/work-pull-request-issue.md:25` — the Allowed list names edits to source, tests, CSS, specs and `help/` and the exclusion "do not edit `documentation/user-documentation/` or `documentation/developer-documentation/`," but names no write to `product/backlog/documentation.md`.
3. `ai/tasks/feature/work-pull-request-issue.md:130` — Step 7 item 4 already requires appending "a ready item describing the documentation work to `product/backlog/documentation.md`," so the write is required but undeclared.
4. `ai/tasks/feature/work-pull-request-issue.md:170` — the report template's Docs line already names the refiled item, so it is left unchanged.

## Existing functionality

1. `ai/tasks/feature/work-pull-request-issue.md:130` — Step 7 item 4 already directs the refiling append in "existing bullet style"; the fix relies on it rather than restating it.
2. `ai/tasks/feature/work-pull-request-issue.md:5` — the Documentation scope paragraph already forbids drive-by edits to either tree; the fix preserves it.
3. `product/specs/pull-request-review.md:19` — the spec already records the refiling behavior, so no spec change is required.

## Implementation steps

1. Extend the opening job statement in `ai/tasks/feature/work-pull-request-issue.md` so the enumeration that records the fix plan and removes the resolved entry also names appending a ready item to the documentation backlog when that entry asks for a change under either documentation tree, and mark it a bookkeeping write that never edits either tree.
2. In the Allowed list, add the `product/backlog/documentation.md` append beside the existing spec/help edits: a ready item appended in that file's existing bullet style when a resolved entry asks for a change under `documentation/user-documentation/` or `documentation/developer-documentation/`, stated as bookkeeping only with the explicit reminder that the repair still must not edit either documentation tree.
3. Leave the Forbidden list, the Step 7 refiling paragraph, and the report template's Docs line unchanged.
4. Run `$janissary/scripts/run.mjs check-diff` (prose-only change; no lint, typecheck, or test surface).
5. Promote this plan to `complete/`, remove the resolved entry from the pull request backlog, commit, and push to the PR's existing head branch.

## UI design

None. The change is to a task playbook's scope declarations, not to an application interface.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. Per the plan template, prose is verified by reading the affected sections rather than by automated tests.

## Out of scope

No source, test, spec, help-page, or documentation-tree edits; no change to the Forbidden list, the Step 7 refiling paragraph, or the report template's Docs line; no merge, close, or replacement of the pull request.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the bookkeeping changes. Then read the opening statement (line 3), the Allowed list (line 25), the Forbidden list (lines 27–39), and Step 7 item 4 (line 130) together: confirm the opening statement and Allowed list both name the `product/backlog/documentation.md` append, that the Allowed list calls it bookkeeping only and restates that neither documentation tree may be edited, that the Forbidden list still bars editing either tree and any unplanned file, that Step 7 item 4 still requires the write, and that the Docs line in the report template is unchanged.
