# Give plan-a-new-feature a UI question round and a UI plan section

**Complexity: 2/10** — one task playbook gains a phase and a plan section, two descriptions of that playbook catch up, and its pin test grows. No runtime surface.

## Goal

`ai/tasks/feature/plan-a-new-feature.md` questions the user about product decisions (flow, edge cases, scope, wording) and then, for high-complexity features, implementation decisions. Nothing in it asks how a feature looks or behaves on screen. So a feature with a new tab, popup, or control reaches the plan with its layout, its empty and error states, its keyboard handling, and its fit with existing UI left for the implementer to guess. The plan has no section to hold those answers either.

The playbook should ask a dedicated round of UI questions, but only when the feature has a UI, and the plan it writes should carry a UI section that records the answers.

The backlog entry names `plan-a-feature.md`. No file has that name. The planning playbook is `ai/tasks/feature/plan-a-new-feature.md`, so that is the file this plan changes.

## Approach

UI decisions hang off product decisions: you can't settle where a panel sits or what its empty state says until you know what the user does with it. And they come before implementation decisions, since which components a feature reuses and where its client code lives depend on what the UI is. So the new phase sits between the two existing ones, as Phase 2, and the implementation phase becomes Phase 3. It uses the same decision-tree mechanism as the other phases rather than a new one.

The phase is gated. It runs when the feature adds or changes something the user sees or operates in the web UI: a tab view, sidebar panel, popup, picker, dialog, control, status display, or key binding. A feature that changes only a command's behavior or its transcript text skips it, because Phase 1's naming and wording category already covers transcript text. The gate sits at the head of the phase rather than in Step 2b, which stays about implementation complexity only.

Before its first round the phase reads the existing UI closest to the feature, so its options can name real components and conventions. That mirrors how Phase 1 grounds its options in Step 2a. The round covers five categories, in the shape of Phase 1's list:

- **Placement and layout**: where the UI appears and how its contents are arranged.
- **Interaction**: how the user opens, operates, and dismisses it, and where focus goes.
- **States**: empty, loading, busy, error, disabled, and overflowing content.
- **Keyboard and accessibility**: bindings checked against `help/keys.md`, focus order and return, Escape, accessible names.
- **Visual consistency**: which existing component, style, or theme convention it matches.

Where client code lives is not a question for the user. The UI section states it as a fact the plan follows, per `ai/guidelines/react-code-organization.md`: a feature directory, logic pushed down into pure modules and hooks, thin components, and the server owning state per `ai/guidelines/architecture-principles.md` §1.

The plan's section list grows from eight to nine. A new "UI design" section sits after "Proposed changes" and before "Tests". It appears only when the feature has a UI. The final checklists learn about it too: one box for knowing the UI's layout, interaction, and states, and the structural check allows the section to be absent for a feature with no UI.

Inserting a phase renumbers the steps after it. 2e becomes 2f, and so on through 2i, which becomes 2j. Every in-text step reference has to follow.

Rejected alternative: fold UI categories into Phase 1's list. It's smaller, but it asks UI questions before the flow they depend on is settled, and it gives a command-only feature UI categories to skip one by one.

## Implementation steps

1. `ai/tasks/feature/plan-a-new-feature.md`:
   - The interactive-task paragraph names the new phase order: product, then UI when the feature has one, then implementation.
   - Step 2b's pointer to the implementation phase becomes "Phase 3 (`2f`)".
   - Step 2c's section list gains "UI design" as item 6. "Tests", "Out of scope", and "Verification" become 7 to 9. The initial draft records only UI facts from Step 2a (the surface it extends, components it resembles), or omits the section when the feature has no UI.
   - New `### 2e. Phase 2 — resolve UI decisions`: the gate, the read-the-closest-UI step, the five categories, concrete options with a recommended default, rounds until the frontier is empty, and each answer written into the UI design section. It also covers the React-organization facts the section states.
   - The implementation phase becomes `### 2f. Phase 3 — resolve implementation decisions`, and its skip pointer becomes 2g. The improvement passes become 2g, the final question phase 2h, the backlog removal 2i, and the merge 2j.
   - The final phase gains the UI checklist box. "All 8 sections" becomes "All 9 sections", with the UI design section present only when the feature has a UI.
2. `scripts/plan-a-new-feature-playbook.test.mjs`: move the improvement-section anchors to `### 2g.`/`### 2h.` and add the tests below.
3. `product/specs/task-picker.md`, `### Planning a new feature`: describe the UI phase and renumber the implementation phase.
4. `documentation/user-documentation/command-bar/tasks.md`: that page lists plan-a-new-feature's phases. Add the UI phase bullet between the product and implementation bullets.

## Tests

`scripts/plan-a-new-feature-playbook.test.mjs` already pins this playbook. The renumbering is exactly the change that can leave a step reference pointing at nothing while still reading fine. Two new tests guard that and the new phase's link to its guideline:

- every step reference in the playbook (`2a` to `2j`, in prose or backticks) names a `### 2x.` heading that exists;
- every `ai/` file path the playbook names in backticks exists in the repo, which covers `ai/guidelines/react-code-organization.md` and the improvement tasks.

The existing tests keep their meaning with the `### 2f.`/`### 2g.` anchors moved to `### 2g.`/`### 2h.`. The header comment is updated to say the file also pins cross-references. The prose of the UI round itself is not pinned, in line with the file's stated rule against pinning prose.

## Out of scope

- `ai/tasks/planning/improve-plan.md` and `improve-plan-with-minimalism.md`. They review whatever sections a plan has.
- `ai/tasks/feature/remove-an-existing-feature.md`. It borrows only the decision-tree mechanism by section name, which doesn't change.
- `ai/tasks/feature/build-a-feature.md` and the other build tasks. They read plans, and an optional extra section needs no change from them.
- `CHANGELOG.md`, which is generated from merged pull requests.
- The other backlog entries.

## Verification

`$janissary/scripts/run.mjs check-diff` passes, including the playbook test. Read the edited playbook top to bottom and confirm the phase order, the gate, and every step letter line up.
