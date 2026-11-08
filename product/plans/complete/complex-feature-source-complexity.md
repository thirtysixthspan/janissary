# Accept every source-plan complexity

**Complexity: 3/10**

## Goal

Run the complex-feature workflow for any honestly rated ready plan, keeping plans rated 1–3 intact.

## Approach

Use the source plan itself as the single work unit for ratings 1–3 and preserve decomposition for ratings 4–10. Keep canonical plan discovery, publication, improvement, implementation, reviews, and PR updates working on both paths with explicit child-task overrides.

## Implementation steps

1. Update `ai/tasks/feature/build-a-complex-feature.md` to remove the source rating gate and define the single-plan route, canonical plan location, child overrides, and reporting. Preserve existing review behavior and decomposed unit limits.
2. Add route regression tests in `scripts/build-a-complex-feature-source-plan.test.mjs`, following its existing playbook assertions. Update `product/specs/pull-request-review.md` with source-plan acceptance and single-plan behavior.
3. Verify the relevant playbook tests and diff checks, promote this plan, remove only the resolved issue, and merge through the repository workflow.

## Tests

- Any honest source complexity from 1–10 is accepted without a minimum-complexity gate.
- Plans rated 1–3 are not decomposed and retain one canonical plan through publication, improvement, implementation, and review.
- Plans rated 4–10 still use ordered subplans with existing implementation limits.
- Existing source-plan discovery and focused review tests continue to pass.

## Out of scope

- Test-and-repair loops and build/conflict recovery requested by the remaining issues.
- Standalone child-task behavior and runtime application behavior.
