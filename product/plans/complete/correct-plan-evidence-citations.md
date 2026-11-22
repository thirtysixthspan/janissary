# Restore the plan's evidence citations to the lines that actually contain their quoted fragments

**Complexity: 1/10** — 5 numeric anchor edits in 1 completed plan, 6 requirements, no production code or tests (p=2.95).

## Goal

The completed plan `product/plans/complete/pull-request-descriptions.md` anchors several of its evidence quotes to `ai/tasks/workspace/open-feature-pull-request.md` at line numbers left over from an intermediate design that added a mode flag to that task. When the full-body task was restored to its master form the added lines were removed, but the plan's citations kept the inflated offsets, so the quoted fragments now point at an example transcript, a Step 0 heading, a blank line and a screenshot paragraph. The goal is to correct those anchors so each quoted fragment resolves to the line where it actually appears, leaving every other part of the plan and all cited files unchanged. This restores a reader's confidence that the plan's evidence was checked against the files it cites.

## Requirements

1. "Restore the plan's evidence citations so each quoted fragment is anchored to the line where it actually appears in the unchanged full-body task." (backlog summary)
2. "update the four stale `ai/tasks/workspace/open-feature-pull-request.md` citations" (Proposal)
3. "so each anchor points to the line where its quoted fragment actually appears in the current `ai/tasks/workspace/open-feature-pull-request.md`" (Proposal)
4. "Read that file and locate each fragment directly rather than assuming a fixed offset" (Proposal)
5. "Leave every other part of the plan, the task instructions and the specs unchanged; there is no behavior to exercise" (Proposal)
6. "sweeping the plan for any other evidence citation left at the intermediate offset" (Proposal)

## Design decisions

- Fix the citations in place in the completed plan; the plan is the artifact under repair, not the full-body task or any spec.
- Locate each fragment by reading the cited file and searching its text directly, never by applying a constant offset, because a fixed offset is what produced the stale anchors when the task's extra lines were removed.
- Keep each quoted fragment's text and its surrounding claim byte-for-byte; only the numeric line anchor changes.
- The change touches no behavior, so verification is by reading the anchors against the cited file rather than by running tests.

## Assumptions

1. The full-body task owns the four ordered body sections — `ai/tasks/workspace/open-feature-pull-request.md:15` (`The body must include **every section below**, in this order`).
2. The `### How to verify` heading follows those sections — `ai/tasks/workspace/open-feature-pull-request.md:47` (`### How to verify`).
3. Step 5 owns the body authoring — `ai/tasks/workspace/open-feature-pull-request.md:140` (`## Step 5 — Write the PR body`).
4. That step sources the body from the plan, specs and diff — `ai/tasks/workspace/open-feature-pull-request.md:148` (`Write them from the plan, the specs the change touches, and the diff`).
5. The task is at its restored master form with no mode flag — `ai/tasks/workspace/open-feature-pull-request.md:9` (`## The PR description`).

## Existing functionality

1. The four-section body structure of the full-body task is the evidence source — `ai/tasks/workspace/open-feature-pull-request.md:15` (`The body must include **every section below**, in this order`).
2. The completed plan being repaired is the plan that carries the stale anchors — `product/plans/complete/pull-request-descriptions.md:1` (`# Plan-first PRs carry a short summary and the update task authors the anchored final description`).
3. The plan convention of a `path:line` anchor plus a quoted fragment is what the citations follow — `ai/guidelines/plan-template.md:31` (`anchors it with \`path:line\` plus a quoted identifier or code fragment`).

## Implementation steps

Read `ai/tasks/workspace/open-feature-pull-request.md` and locate each of the quoted fragments by searching the file's text directly, recording the line on which each actually appears.

In `product/plans/complete/pull-request-descriptions.md`, replace the five stale anchors with the verified lines, changing only the numeric anchor in each:

- Assumption 1 four-section-body rule: `:36` → `:15`
- Assumption 1 `### How to verify` heading: `:68` → `:47`
- Assumption 2 Step 5 heading: `:161` → `:140`
- Assumption 3 write-from-plan prose: `:171` → `:148`
- Existing functionality 1 four-section-body rule: `:36` → `:15`

Sweep the rest of the plan for any other citation to `open-feature-pull-request.md` left at the intermediate offset and confirm each remaining anchor resolves to its quoted fragment; leave all other text byte-for-byte unchanged. Do not edit `ai/tasks/workspace/open-feature-pull-request.md` and do not reintroduce a mode flag.

## UI design

None. This change edits evidence prose in a completed plan; no user interface surface is added, removed or modified.

## Tests

This plan changes no application behavior and introduces no code, so there are no application tests to add and no tests of documentation are introduced. Verification is by reading each corrected anchor against the file it cites.

## Out of scope

The full-body task, the mode flag, every other task instruction, every spec, the PR description, PR titles, commit subjects, the plan's complexity line and completion status, and all other plan content are unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck or test regression.

Then do a concrete reading-based check. Read `product/plans/complete/pull-request-descriptions.md` and, for each of the five corrected anchors, open `ai/tasks/workspace/open-feature-pull-request.md` at the cited line and confirm the quoted fragment appears there verbatim: line 15 (`The body must include **every section below**, in this order`) for Assumption 1 and Existing functionality 1, line 47 (`### How to verify`) for Assumption 1, line 140 (`## Step 5 — Write the PR body`) for Assumption 2, and line 148 (`Write them from the plan, the specs the change touches, and the diff`) for Assumption 3. Sweep the plan's other evidence citations and confirm each resolves to its quoted fragment. Finally confirm the full-body task is unchanged and describes a single four-section body with no mode flag. A corrected anchor that lands off its quoted fragment, another stale citation at the old offset, or a reintroduced mode flag shows the change was not made correctly.
