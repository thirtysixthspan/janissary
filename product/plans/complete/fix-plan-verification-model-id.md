# Correct the plan's verification model id

**Complexity: 1/10** — one model id in one line of one file, plus its tests section cross-reference.

## Goal

Verification step 1 of `product/plans/complete/delegate-to-agents.md` names `google/gemini-3.1-pro`. The harness catalog's `opencode` list has `google/gemini-3.1-pro-preview` and no `google/gemini-3.1-pro`, so a reviewer following the plan's own step gets `Unknown model "google/gemini-3.1-pro" for harness "opencode" — add it to harness-models.json.` and no tab — which reads as a defect in the feature rather than in the step. Observed three times out of three while testing the pull request.

## Approach

Replace the id with the catalog's spelling and expect the connections-panel row to match it, since the row carries whatever model the session launched with.

Check the rest of that one file for the same bare id. Two other completed plans mention `gemini-3.1-pro`, but as `-preview` or as catalog-history prose, and neither is in scope.

The catalog must not gain an entry to make the step pass: the validation is what makes the mistake visible, and adding a model id no provider serves would be a worse defect than the one being fixed.

## Tests

None. No behavior changes.

## Out of scope

- Correcting the pull request's **How to verify**, which already uses `opencode-go/glm-5.3` — an id the catalog offers — and stays exactly as its author wrote it.
- Any change to `harness-models.json`.