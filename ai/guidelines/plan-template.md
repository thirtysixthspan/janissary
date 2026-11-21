# Plan Template

This is the canonical statement of what a plan must contain. Every plan follows it, whether it is first drafted by `ai/tasks/feature/plan-a-new-feature.md`, decomposed by `ai/tasks/planning/decompose-plan.md`, or rewritten by an improvement pass. A task that writes, decomposes, or changes a plan defers to this file instead of restating a section list. This is the single owner of the plan's structure; a second copy living in a task prompt is a bug.

A plan is a markdown file under `./product/plans/`, organized by status (`draft/`, `ready/`, `complete/`, `deferred/` — see the root `AGENTS.md`). Use natural line breaks, not fixed-column wrapping.

## The complexity line

A finished plan carries a `**Complexity: N/10** — <one-line rationale naming what drives the number>` line directly under its `#` title, before the first section. The rating step adds it: the judgment task defines the 1 to 10 scale and the quantitative task records the number by formula. This line is the one phase-specific exception to the common shape. A draft produced by `plan-a-new-feature.md` omits it, because that task never rates; the improvement passes add or update it on the finished plan. No other task introduces or edits the line. The template names the exception here so the drafting task's "no complexity line" rule and the rating step's "add the complexity line" rule do not read as a contradiction.

## Sections

The sections appear in this order: `Goal`, `Design decisions`, `Assumptions`, `Requirements`, `What already exists (reuse, don't rebuild)`, `Implementation steps`, `UI design`, `Tests`, `Out of scope`, `Verification`. Each is a level-two (`##`) heading. Every section is required in every plan except `UI design`, which is conditional. Each section below states its heading, its status, and the format and content a reader can check.

### Goal

Required. A short prose paragraph stating the feature's goal and why it matters. This replaces the old untitled summary paragraph: a plan has no anonymous opening block of text. Ground the goal in the feature text, not in a hoped-for design, and keep it to what the plan will actually deliver.

### Design decisions

Required. The decisions that shape the implementation, one per bullet, established by the feature text, existing behavior, or a settled user answer. Decisions lead the plan: the sections that follow record their premises and acceptance criteria. State each choice plainly and, where an alternative was seriously considered and rejected, give the reason in one line so a future reader does not reopen it.

### Assumptions

Required. Facts taken as true that an implementer should not re-decide — what the code, the specs, or the user's answers have already settled. Each bullet names the fact and its source (a file, a spec, or an answer), so an implementer can verify it rather than guess. An assumption is not an open decision: if a point is still undecided, the planning task resolves it with the user before the plan is finished, it does not get parked here.

### Requirements

Required. The behaviors and edge cases the implementation must satisfy, one per bullet, each traceable to the feature text or a user answer. These are the acceptance criteria: an implementer reads them and knows when the feature is done. Include the empty, duplicate, error, and boundary cases the feature promises, stated as observable behavior rather than a vague verb like "handle errors" or "update the UI".

### What already exists (reuse, don't rebuild)

Required. A **table** with a `Concern` column and a `Where it already lives` column. Each row names a mechanism the plan needs and points at the code, spec, or component that already provides it — a file path plus the identifier, so the reference survives line drift. When reconnaissance found no precedent, a single "None found" row is acceptable; the table stays. The point is to make reuse the default and a from-scratch build something a reviewer can spot in the diff.

### Implementation steps

Required. Prose describing the changes in the order they should land, so each checkpoint typechecks and no contract is left mismatched across the server and client. Name the modules, functions, types, and contracts involved; say where new code goes and which existing mechanism it extends or replaces. This replaces the old `Proposed changes` heading, and that name is gone. Never include implementation code — no function bodies, no JSX, no CSS, no type the implementer would paste. Illustrative observable output (a CLI transcript, an error message, an ASCII sketch of UI) is fine.

### UI design

Conditional. Present only when the feature has a UI; leave it out entirely when it does not. A feature has a UI when it adds or changes something the user sees or operates in the web UI — a tab view, sidebar panel, popup, picker, dialog, control, status display, or key binding. A change only to a command's behavior or to its transcript text does not count as a UI; that wording belongs in `Goal` or `Requirements`. When the section is present, it states the surface the feature extends, its placement and layout, its interactions and focus behavior, its states (empty, loading, busy, failed, disabled, and overflow), its key bindings and accessibility, and which existing component or style it matches. It also states, as fact rather than as a question for the user, where the client code lives under `ai/guidelines/react-code-organization.md`: a feature directory named for the feature, decisions in pure modules and hooks, thin components, and no import from another feature. State that every piece of state the server owns stays on the server, per `ai/guidelines/architecture-principles.md` §1.

### Tests

Required. Name what should be covered and where, mirroring the test conventions of the touched area (`src/**/*.test.ts`, `web/src/**/*.test.tsx`). Tie each entry back to a requirement in `Requirements` rather than listing tests in the abstract. If the plan changes no application behavior and introduces no code, say so explicitly here instead of inventing tests.

### Out of scope

Required. The boundaries of this version: what the feature deliberately does not do, what stays unchanged, and any migration deliberately deferred. A goal that grows mid-document is a bug; this section is where the plan draws the line.

### Verification

Required. How to confirm the implementation is correct. End the plan with the diff-scoped check command `$janissary/scripts/run.mjs check-diff`, followed by at least one concrete manual end-to-end check a reader can actually perform against the running app: the exact command or interaction, what they should see, and what a failure looks like. The diff-scoped command alone proves only that there is no lint, typecheck, or test regression; the manual check is what proves the change really does what the plan promised.
