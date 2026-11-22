# Plan Template

This is the canonical statement of what a plan must contain. Every plan follows it. A task that writes, decomposes, or changes a plan defers to this file. This is the single owner of the plan's structure. A plan is a markdown file under `./product/plans/`, organized by status (`draft/`, `ready/`, `complete/`, `deferred/` — see the root `AGENTS.md`). Use natural line breaks, not fixed-column wrapping.

## Title

One-line description of the change that is suitable for a pull request title.

## The complexity line

A finished plan carries a `**Complexity: N/10** — <one-line rationale naming what drives the number>` line directly under its title, before the first section. A rating step adds it: the judgment task defines the 1 to 10 scale and the quantitative task records the number by formula. This line is the one phase-specific exception to the common shape. A draft produced by `plan-a-new-feature.md` omits it, because that task never rates; the improvement passes add or update it on the finished plan.

## Sections

The sections appear in this order: `Goal`, `Requirements`, `Design decisions`, `Assumptions`, `Existing functionality`, `Implementation steps`, `UI design`, `Tests`, `Out of scope`, `Verification`. Each is a level-two (`##`) heading. Every section is required in every plan. Each section below states its heading and the format and content a reader can check.

### Goal

A short prose paragraph stating the feature's goal and why it matters. Ground the goal in the feature text keeping to what the plan will actually deliver.

### Requirements

The behaviors and edge cases the implementation must satisfy, written as a numbered list. Each numbered requirement carries exactly one behavior. Split any sentence that joins two behaviors with "and" into two requirements. Quote the feature text or the settled user answer each requirement comes from rather than restating it in the plan's own words. These are the acceptance criteria: an implementer reads them and knows when the feature is done. Include the empty, duplicate, error, and boundary cases the feature promises, stated as observable behavior.

### Design decisions

The decisions that shape the implementation, one per bullet, established by the feature text, existing behavior, or a settled user answer. Decisions lead the plan: the sections that follow record their premises and acceptance criteria. Decisions based on assumptions must be explictly linked to an assumption listed in the Assumptions section. 

### Assumptions

Assumptions are statements taken to be true. They include what the code, the specs, or the user's answers have already settled. An assumption is not an open decision. Assumptions are determined in planning and never re-decided by an implementer. Assumptions are written as a numbered list. Each list item states one assumption and anchors it with `path:line` plus a quoted identifier or code fragment it rests on.

### Existing functionality

This section provides a numbered list identifying existing functionality to be used in the implementation. Each list item names a mechanism the plan needs and points at the code, spec, or component that already provides it. Each list item states just one mechanism and anchors it with `path:line` plus a quoted identifier or code fragment. When reconnaissance found no precedent, a single "None found" is acceptable. 

### Implementation steps

Prose describing the changes in the order they should land, so each checkpoint typechecks and no contract is left mismatched across the server and client. Name the modules, functions, types, and contracts involved; say where new code goes and which existing mechanism it extends or replaces. Never include implementation code — no function bodies, no JSX, no CSS, no type the implementer would paste. Illustrative observable output (a CLI transcript, an error message, an ASCII sketch of UI) is fine.

### User interface

The user interface section states as a numbered list, the user interface surfaces that the feature modifies or creates. These include but are not limited to its placement and layout, its interactions and focus behavior, its states (empty, loading, busy, failed, disabled, and overflow), its key bindings and accessibility, and which existing component or style it matches. A feature has a UI when it adds or changes something the user sees or operates through any channel. 

### Tests

Name what should be covered and where, mirroring the test conventions of the touched area (`src/**/*.test.ts`, `web/src/**/*.test.tsx`). Tie each entry back to a requirement in `Requirements` rather than listing tests in the abstract. If the plan changes no application behavior and introduces no code, say so explicitly here instead of inventing tests. Tests of documentation should not be introduced.

### Out of scope

The boundaries of this version: what the feature deliberately does not do, what stays unchanged, and any migration deliberately deferred. 

### Verification

How to confirm the implementation is correct. Every plan ends with the diff-scoped check command `$janissary/scripts/run.mjs check-diff`, followed by at least one concrete manual check a reader can actually perform. The diff-scoped command alone proves only that there is no lint, typecheck, or test regression; the manual check is what proves the change really does what the plan promised, so `check-diff` is never sufficient proof on its own. The manual check's form is set by the plan's surface:

A plan that adds or changes application behavior ends with a concrete end-to-end check against the running app: the exact command or interaction, what the reader should see, and what a failure looks like. A plan that changes no application behavior and adds no code ends with a concrete reading-based check instead: the exact files to read and the specific consistency claims to confirm in them, stating what a reader should find and what would show the change was not made correctly. Both forms exist because a documentation-, spec-, or configuration-only plan has no running app to exercise, but every plan still needs one concrete, reader-performable manual check. 

