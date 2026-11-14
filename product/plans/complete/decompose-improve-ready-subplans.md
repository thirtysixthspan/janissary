# Decompose, improve, and promote subplans before building

**Complexity: 1/10** — workflow documents and specs only; all five production-code counts are zero (p=1.578).

## Goal

Make plan decomposition split once into subplans initially rated 1–4, then improve and promote them to ready without resplitting, even if improvement raises their complexity. Move the decomposed-subplan improvement and promotion workflow out of the complex-feature builder so standalone decomposition has the same complete planning behavior.

## Approach

Keep the source plan unchanged and preserve its full scope, dependency order, and canonical completed-plan identity. Rate the initial draft pieces quantitatively and report a blocker if any misses the 1–4 decomposition target, without resplitting. Improve each accepted piece in sequence, retain its honest final rating even if it grows, and promote it to ready. The builder's first commit still introduces exactly one canonical completed plan. The builder respects the existing build-a-feature cutoff at 7 and reports higher ratings as blocked without another decomposition pass.

Reuse the existing improvement and quantitative rating tasks, skipping their workspace preparation and selection when called. Preserve the builder's intact 1–5 single-plan route and its existing implementation, publication, and review safeguards.

## Implementation steps

1. Update `ai/tasks/planning/decompose-plan.md` to own one decomposition pass, improvement, honest rerating without resplitting, ready promotion, final coverage and dependency validation, and reporting of initial and final ratings and ready paths.
2. Update `ai/tasks/feature/build-a-complex-feature.md` to consume improved ready subplans initially rated 1–4, publish them before implementation, and remove duplicate subplan improvement, promotion, and resplitting. Keep single-plan improvement in place and route new coverage gaps through decomposition.
3. Update the decomposition behavior in `product/specs/task-picker.md` and staged planning behavior in `product/specs/pull-request-review.md`.
4. Verify the documents against direct decomposition, an initial rating above 4, improvement raising a rating to 5 or 6, dependency references after promotion, complex-feature publication, and the intact single-plan route. Promote this plan to complete and ship through the issue workflow.

## Tests and verification

This changes workflow documents only. Review the six scenarios above against the task instructions and specs, check all step references and complexity boundaries, and run the required diff-scoped checks. No runtime tests or public help changes are needed because application behavior does not change.

## Validation results

Reviewed direct decomposition and its one-subplan case, the initial-rating blocker, honest growth to 5 or 6 without resplitting, ready-path dependencies, publication before implementation, and the intact single-plan route. Confirmed the standalone feature builder's existing cutoff is 7, so growth to 5 or 6 remains implementable and growth to 7 blocks the builder without another split. The source plan remains unchanged during decomposition and is the only completed plan introduced by initial publication.

Diff-scoped checks and whitespace validation passed. Only Markdown changed, so no lint, typecheck, or runtime test tasks were applicable. Existing public help does not describe this internal workflow and needs no update.

## Out of scope

Changing the complexity formula, changing which source plans the complex-feature builder decomposes, changing standalone improve-plan promotion rules, runtime source changes, dependency updates, and changes to review, testing, or merge policy.
