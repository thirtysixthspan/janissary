# Accommodate no-code plans in the plan template's Verification section

**Complexity: 1/10** — docs-only change to agent guidance: 0 production lines, 0 production files edited, 0 behavioral requirements, scenarios, or new code units (p=1.578).

## Goal

`ai/guidelines/plan-template.md` requires every plan to end with a concrete manual end-to-end check a reader performs against the running app. A documentation-, spec-, or configuration-only plan has no running app to exercise, so it cannot satisfy a section the template calls required without inventing a meaningless check or silently omitting it. The goal is to redefine that manual check by the plan's surface so a no-code plan has a real, performable form, while keeping one concrete reader-performable check mandatory for every plan.

## Design decisions

- The change is confined to two guidance documents: `ai/guidelines/plan-template.md` and `ai/tasks/planning/improve-plan.md`. No source, test, config, help page, or user-documentation file changes.
- The Verification section keeps its required ending: `$janissary/scripts/run.mjs check-diff` followed by at least one concrete, reader-performable manual check. The check's form is set by the plan's surface.
- A plan that adds or changes application behavior keeps the running-app end-to-end check: the exact interaction, what the reader should see, and what failure looks like. A plan that changes no application behavior and adds no code uses a reading-based check instead: the files to read and the specific consistency claims to confirm in them.
- Both forms exist because a no-code plan has no runtime surface to drive, but every plan still needs one concrete manual check; `check-diff` alone proves only the absence of lint, typecheck, and test regressions and is never sufficient proof on its own.
- `product/plans/complete/plan-template.md`'s own Verification section is the worked example of the no-code form: it pairs `check-diff` with reading and scratch-plan checks rather than a running-app check. No plan file is edited — those are historical records.
- The template stays the single owner of plan shape. `improve-plan.md` keeps an aligned verification instruction that names both forms and defers to the template for the definition, rather than a competing copy.
- `ai/tasks/planning/improve-plan-with-minimalism.md` needs no change: it carries no Verification or end-to-end wording and already defers plan shape to the template (Step 2 item 4).
- No functional spec changes. No spec states the Verification shape requirement; the specs that mention the template or Verification remain accurate, and writing a second copy there would break the template's single ownership.

## Assumptions

- `ai/guidelines/plan-template.md`, "Verification" (line 53), currently requires a manual end-to-end check "against the running app" for every plan — read and confirmed.
- `ai/tasks/planning/improve-plan.md`, Step 3 "Missing verification" bullet, currently says "plus a concrete manual end-to-end check" — read and confirmed.
- `product/plans/complete/plan-template.md`, "Verification" (lines 63–68), is a documentation-only plan whose manual checks read the changed documents and draft a scratch plan under `./temp/` — read and confirmed as a valid no-code example.
- `ai/tasks/planning/improve-plan-with-minimalism.md` defers to the template and carries no Verification wording — read and confirmed.
- `product/specs/task-picker.md` defers plan shape to the template, and `product/specs/pull-request-testing.md` refers to "the manual checks in the Verification section" — both remain accurate under either form, read and confirmed.
- `AGENTS.md` applies the 200-line `max-lines` and `.js` import-extension rules to `src/` and `web/src/`, not to guidance documents; no such constraint applies here.

## Requirements

- The template's Verification section states that every plan ends with `$janissary/scripts/run.mjs check-diff` plus at least one concrete, reader-performable manual check.
- For a plan that adds or changes application behavior, the manual check is an end-to-end check against the running app naming the exact interaction, the expected observation, and the failure appearance.
- For a plan that changes no application behavior and adds no code, the manual check is a reading-based check naming the files to read and the specific consistency claims to confirm.
- The section states why both forms exist and that `check-diff` is never sufficient proof on its own, so every plan still needs one concrete manual check.
- The section cites `product/plans/complete/plan-template.md`'s Verification section as the worked example of the no-code form.
- `improve-plan.md`'s verification instruction is compatible with both forms and points at the template as the definition's authority.
- No source, test, config, help page, or user-documentation file changes.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The canonical Verification requirement being amended | `ai/guidelines/plan-template.md`, "Verification" |
| The improvement pass's verification instruction to align | `ai/tasks/planning/improve-plan.md`, Step 3 "Missing verification" |
| Worked example of a no-code plan's reading-based verification | `product/plans/complete/plan-template.md`, "Verification" (lines 63–68) |
| Sibling improvement task that needs no edit | `ai/tasks/planning/improve-plan-with-minimalism.md`, Step 2 item 4 |
| Specs that defer plan shape to the template or refer to the manual checks | `product/specs/task-picker.md`, planning paragraphs; `product/specs/pull-request-testing.md` |
| The diff-scoped gate command named by the section | `$janissary/scripts/run.mjs check-diff` (AGENTS.md, "Verifying changes") |

## Implementation steps

1. In `ai/guidelines/plan-template.md`, rewrite only the "Verification" section: keep the required `$janissary/scripts/run.mjs check-diff` ending, replace the single running-app mandate with the two surface-defined forms, add the statement of why both exist and that `check-diff` is never sufficient alone, and cite `product/plans/complete/plan-template.md`'s Verification section as the worked example. Touch no other section.
2. In `ai/tasks/planning/improve-plan.md`, update only the Step 3 "Missing verification" bullet so it names both manual-check forms and defers the definition to `ai/guidelines/plan-template.md`. Touch no other part of the task.
3. Re-read the revised template beside `product/plans/complete/plan-template.md`, `ai/tasks/planning/improve-plan.md`, and `ai/tasks/planning/improve-plan-with-minimalism.md` and confirm a no-code plan can satisfy the Verification section with a reading-based check it can actually perform, without inventing a running-app check.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced; the `src/**/*.test.ts` and `web/src/**/*.test.tsx` conventions do not apply to guidance documents. Conformance is checked with `$janissary/scripts/run.mjs check-diff` and the manual reading checks in Verification.

## Out of scope

- Changes to source, tests, configuration, help pages, or user documentation.
- Edits to any plan file under `product/plans/`, including the worked example; those are historical records.
- Changes to the template's section list, order, or conditional `UI design` rule — only the Verification section's content changes.
- A change to `ai/tasks/planning/improve-plan-with-minimalism.md`, which carries no Verification wording to reconcile.
- A change to any functional spec: none states the Verification shape, the specs that reference it remain accurate, and a second copy would break the template's single ownership.

## Verification

- `$janissary/scripts/run.mjs check-diff`. This change touches only guidance documents, so a clean run confirms no lint, typecheck, or test regression; it does not by itself prove the documents agree.
- Manual: read the revised `ai/guidelines/plan-template.md` Verification section beside `product/plans/complete/plan-template.md`'s Verification section and confirm a no-code plan can satisfy it with a concrete reading-based check that names files and consistency claims, with no running app.
- Manual: read `ai/tasks/planning/improve-plan.md`'s verification bullet and `ai/tasks/planning/improve-plan-with-minimalism.md` and confirm neither carries a running-app-only requirement that contradicts the template.
- Manual: `git status --short` shows only the two guidance files, the fix plan, and the backlog file as changed.
