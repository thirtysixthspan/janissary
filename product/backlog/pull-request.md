<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the harness spec's Tab-completion wording so the spec faithfully describes the implemented completion behavior.

Existing Issue: The rewritten Model paragraph in the harness spec says "`Tab` completes the highlighted match," but the shared input's `completeModel` fills a unique match or the longest common prefix of all matches and never reads the highlighted row, so with several matches Tab inserts a shorter prefix (or nothing), not the highlighted id. Severity: 2/10

Existing Risk: 3/10 - A reader relying on the spec expects Tab to insert the highlighted model id, but in the common multi-match case they get a common prefix or no completion, and a future maintainer may "fix" the input to complete the highlighted row and regress the established completion behavior its tests pin.

Proposal Risk: 1/10 - The change is documentation-only, leaving the completion logic and its tests untouched; the only residual risk is ordinary doc drift if the input later changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2099 "correct the harness spec's Tab-completion wording". In product/specs/harness.md, rewrite the sentence in the "New harness launch dialog" section that reads "`Tab` completes the highlighted match" to state the actual behavior — Tab completes a single match, or fills the longest common prefix when several match — matching the accurate wording already in documentation/user-documentation/tab-types/roles.md ("`Tab` completes a single match or a common prefix") and the behavior of `completeModel` in web/src/shared/model-search/model-search.ts. Leave the input, its keyboard handling, and the ModelSearchInput tests untouched; the shared component's own tests pin the completion behavior this spec must describe, so no source change is needed. Verify the sentence agrees with the roles user-doc and with `completeModel` for both the single-match and multi-match cases.
