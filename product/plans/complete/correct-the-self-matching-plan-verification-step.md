# Correct the repoint plan's self-matching verification step

**Complexity: 1/10** — no production lines or files, one rewritten verification sentence, one scenario (p=2.32)

Implementation step 6 of `product/plans/complete/repoint-promoted-result-rendering-plan-references.md` tells the reader to grep `product` for the stale path's shortened prefix, expects the backlog entry to be that search's only hit, and then claims plan files never spell the literal. None of that holds. The backlog entry never spelled the literal, and the sentence carrying the quoted pattern is itself a match, so the documented check can never report clean — even after the entry is removed it still finds the plan's own instruction.

## Goal

Implementation step 6 of that plan says something a reader can check without the instruction matching itself: keep the re-read of each edited sentence, and replace the grep-and-expect-clean clause with the property the grep was meant to prove — every reference to the result-rendering plan under `product/plans/` names it under `complete/`, and none routes it through a `ready/` segment. The plan then names the stale path's shortened prefix nowhere, so a search for that prefix over `product` returns nothing once this branch's backlog entry is removed. The occurrence table, Tests section, out-of-scope bullets, and every other file stay exactly as they are.

## Approach

Rewrite Implementation step 6 in place, in `product/plans/complete/repoint-promoted-result-rendering-plan-references.md`. Keep the opening clause that re-reads each edited sentence against the types and functions it names. Replace the grep-and-expect-clean clause with the property statement. Delete the sentence that follows it, about what plan files do and do not spell.

The repaired step reads: re-read each edited sentence to confirm it still names the same types and functions, then check that every reference to the result-rendering plan under `product/plans/` names it under `complete/` and none routes it through a `ready/` segment.

Do not reintroduce the stale path's shortened prefix anywhere in the plan, and do not quote the stale full path either. The property is checkable by reading the references; no search pattern needs spelling in the document for the check to work. The repair itself — the seven repointed references — is correct and needs no rework.

## Implementation steps

1. In `product/plans/complete/repoint-promoted-result-rendering-plan-references.md`, replace Implementation step 6 with the rewritten step above.
2. Confirm the plan contains the stale path's shortened prefix nowhere and still names the result-rendering plan only by its `complete/` path.
3. Search `product` for the pre-promotion form of the result-rendering path — the `ready/`-folder variant of the path that now lives under `complete/` — in its shortened-prefix form, and confirm the search returns no matches in any file.

## Tests

None. The change is one sentence inside a plan document; no behavior, type, or executable code changes, so no test can distinguish before from after. Verification is the stale-path search over `product` returning no matches, a read of the rewritten step, and `$janissary/scripts/run.mjs check-diff` for the documentation-only diff.

## Spec

No functional spec applies: no command, flag, default, message, or user-visible behavior changes. The fix corrects a verification instruction inside the plan graph only.

## Out of scope

- The repoint plan's occurrence table, Goal, Approach, Tests section, and out-of-scope bullets, which describe the completed repair correctly.
- Any automated link check for the plan graph; none exists on this branch and this repair does not build one.
- Every source, test, spec, help, and user-documentation file.
