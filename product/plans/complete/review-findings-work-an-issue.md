# Route review findings through work-an-issue

Complexity: 2/10

## Goal

Every new pull-request review finding names work-an-issue as its execution workflow, including security findings, with the reviewed PR preserved as the delivery target.

## Approach

Keep review and implementation separate. Specify a single follow-up invocation in the review task's overview, proposal contract, and example. Treat references to other review checklists as reference material only, not alternative execution routes.

## Implementation steps

1. Update ai/tasks/pull-request-review.md to require every Proposal to begin with an execute invocation of ./ai/tasks/work-an-issue.md using the PR-number prefix and a concrete issue summary. Explicitly cover all five dimensions and prohibit routing to other tasks or substituting a human-only handoff for an implementation proposal.
2. Clarify that the security checklist is detection guidance only. Preserve the review's no-fix, backlog-only, deduplication, and leave-open rules.
3. Add product/specs/pull-request-review.md describing the review and follow-up routing behavior.

## Tests and verification

Manually check representative description, plan, functionality, debt, and security proposals against the routing contract. Check that the worked example contains the PR prefix supported by work-an-issue and that the checklist does not redirect execution. Verify the review still cannot execute proposals. Run ./scripts/run.mjs check-diff and git diff --check. No executable code changes or new automated tests are needed for this prose-only contract change.

## Out of scope

Executing existing findings, rewriting recorded backlog entries, changing work-an-issue, changing other tasks' security policies, or changing help and public documentation about the task picker.
