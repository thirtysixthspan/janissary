# Resolve the remaining stale anchors in the promoted plan

**Complexity: 1/10** — single-file documentation-only anchor repair: 8 stated requirements, 0 production lines/files/test scenarios and 0 new units (p=3.13).

## Goal

Deliver the promise made by `product/plans/complete/preserved-behavior.md` that every `path:line` anchor in the promoted plan lands on the line carrying its quoted fragment. A prior repair corrected the anchors that had shifted, but three anchors still point at text that no longer matches: two cite feature text removed from the backlog when the ready plan was promoted, and one quotes a sentence that a section-rule repair qualified. Correct those three so a reader following any anchor in the plan reaches the right line and the "Wrong or stale references" check in `ai/tasks/planning/improve-plan.md` no longer flags the plan the pull request tells readers to trust.

## Requirements

1. The `ai/guidelines/plan-template.md:15` anchor's quoted fragment must match the qualified sentence now on that line, "Every section is required in every plan;", rather than the pre-repair wording "Every section is required in every plan." with a trailing period. (Backlog `Existing Issue` and `Proposal`.)
2. The two `product/backlog/features.md` anchors, `:7` and `:12`, in Assumption 7 must be replaced because the feature text they quoted was removed from the backlog when the ready plan was promoted. (Backlog `Existing Issue`.)
3. The replacement must point the claim at the plan's own `## Goal` and `## Requirements` sections, which now hold the feature text, or restate it as a self-contained statement without a stale backlog line. (Backlog `Proposal`.)
4. Every other anchor, every quoted identifier whose target still resolves, and all rule text stays byte-for-byte unchanged. (Backlog `Proposal`.)
5. No file other than `product/plans/complete/preserved-behavior.md` changes. (Backlog `Proposal`: "Only anchor text inside a completed plan changes".)
6. Each affected anchor is verified by opening the named line and confirming the quoted fragment is present, as `ai/tasks/planning/improve-plan.md` Step 3 requires. (Backlog `Proposal`.)
7. No rule, section, source document, other plan, spec, help page, or application behavior is touched. (Backlog `Proposal Risk`.)
8. No pull request description correction is needed or performed. (Invocation.)

## Design decisions

- The fix edits only the promoted plan. The five source documents are already correct; only the plan's anchors disagree with them, so changing the plan restores agreement without touching any source.
- The `plan-template.md:15` anchor keeps its line number and changes only its quoted fragment: the target line is right, but the section-rule repair qualified its sentence, so the identifier must follow the new wording.
- The two `features.md` anchors cannot be repaired by renumbering, because the feature text they quoted no longer exists in that backlog. They are replaced by a self-contained statement pointing at the plan's own `## Goal` and `## Requirements`, where the feature text now lives.
- Only the three named anchors change. Every other anchor, every identifier whose target still resolves, and all rule text is left untouched.
- This is a documentation-only correction with no application behavior, so it adds no code, no tests, no spec, and no help text.

## Preserved behavior

None found. The change only corrects anchor text in a completed plan; it changes no application behavior and no rule that a future plan relies on.

## Assumptions

1. The promoted plan is the one this pull request moved into `product/plans/complete/` — `product/plans/complete/preserved-behavior.md:1` ("# Preserved behavior").
2. The template's section-rule line now reads with a semicolon — `ai/guidelines/plan-template.md:15` ("Every section is required in every plan;").
3. The backlog lines the plan cited now carry unrelated text — `product/backlog/features.md:7` ("AI personas should specify a role instead of a model and tools.") and `product/backlog/features.md:12` ("Expose role tools to ACP models as direct MCP tools").
4. The feature text now lives in the plan's own sections — `product/plans/complete/preserved-behavior.md:5` ("## Goal") and `product/plans/complete/preserved-behavior.md:9` ("## Requirements").
5. Anchor verification is a named improvement step — `ai/tasks/planning/improve-plan.md:57` ("**Wrong or stale references.** Paths, symbols, or line anchors that don't match the repo.") and `ai/tasks/planning/improve-plan.md:58` ("Open the file at that line: confirm the identifier is actually there and that the quoted fragment and the claim match what the code does.").
6. No functional spec covers plan-anchor correctness — `product/plans/complete/reconcile-template-section-requirement.md:35` ("No functional spec covers plan-template authoring rules") records the precedent for this class of internal document edit, and no help page describes a command, flag, or key binding touched here.

## Existing functionality

1. The `path:line` plus quoted-identifier anchor convention that makes references survive line drift — `ai/guidelines/plan-template.md:35` ("anchors it with `path:line` plus a quoted identifier or code fragment it rests on").
2. The stale-reference detection rule that drives the verification — `ai/tasks/planning/improve-plan.md:57` ("**Wrong or stale references.** Paths, symbols, or line anchors that don't match the repo.").
3. The corrected template target for the qualified sentence — `ai/guidelines/plan-template.md:15` ("Every section is required in every plan;").
4. The plan's own sections that now hold the feature text — `product/plans/complete/preserved-behavior.md:5` ("## Goal") and `product/plans/complete/preserved-behavior.md:9` ("## Requirements").

## Implementation steps

First, read `product/plans/complete/preserved-behavior.md` in full and list every `path:line` anchor together with the quoted fragment it carries; open each named line and mark which fragments are absent. Build command: `$janissary/scripts/run.mjs check-diff` (no file changes yet, so this confirms a clean tree).

Second, in Assumption 1 of `product/plans/complete/preserved-behavior.md`, change the quoted fragment of the `ai/guidelines/plan-template.md:15` anchor from "Every section is required in every plan." to "Every section is required in every plan;" so it matches the line the anchor already points at. Change no other part of that line and no other anchor. Build command: `$janissary/scripts/run.mjs check-diff`.

Third, in Assumption 7 of `product/plans/complete/preserved-behavior.md`, replace the two `product/backlog/features.md` anchors and their quoted fragments with a self-contained statement that keeps the claim "Every edit the feature text names is a document under `ai/`", points at this plan's own `## Goal` and `## Requirements` as the place the feature text now lives, names the five `ai/` documents those sections edit, and keeps the observation that no file under `product/specs/` is named. Build command: `$janissary/scripts/run.mjs check-diff`.

Fourth, verify every affected anchor by opening the named line and confirming the quoted fragment is present, then confirm every other anchor in the plan still resolves and that no other file in the working tree changed. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change touches a completed plan document only and exposes no user-visible surface.

## Tests

This change edits only a completed plan document and introduces no code and no application behavior, so no tests are added; per the plan template, tests of documentation are not introduced. Correctness is established by the reading-based check under Verification.

## Out of scope

- No rule, section, or source document changes; the five `ai/` documents stay byte-for-byte as they are.
- No source, test, config, spec, help, or documentation file is changed.
- No other anchor in the promoted plan and no other plan is changed.
- No pull request description correction is part of this work.
- No other entry in `product/backlog/pull-request.md` is edited.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression.

Then do a concrete reading-based check. Re-read `product/plans/complete/preserved-behavior.md` and confirm the `ai/guidelines/plan-template.md:15` fragment now reads "Every section is required in every plan;" with no occurrence of the old trailing-period wording, and that no `product/backlog/features.md` anchor remains anywhere in the plan. Open `ai/guidelines/plan-template.md:15` and confirm the qualified sentence is present; open `product/plans/complete/preserved-behavior.md:5` and `:9` and confirm the `## Goal` and `## Requirements` sections name the five `ai/` documents the replacement statement cites and name no file under `product/specs/`. Re-open every other named line in `ai/guidelines/plan-template.md`, `ai/tasks/feature/plan-a-new-feature.md`, `ai/tasks/planning/improve-plan.md`, `ai/tasks/planning/decompose-plan.md`, and `ai/tasks/feature/review-pull-request.md` and confirm its quoted fragment is still present. Confirm no file other than the promoted plan changed in the working tree. A quoted fragment missing from its named line, a stale backlog anchor left behind, or an edit outside the promoted plan means the fix did not land correctly.
