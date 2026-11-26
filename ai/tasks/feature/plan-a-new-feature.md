# Plan a New Feature

Your job: pick one feature — the first entry under the `## ready` section of `./product/backlog/features.md`, or a specific feature named in the task invocation, which need not be listed there at all — write an initial draft plan for it into `./product/plans/draft/`, resolve its product decisions with the user, and leave a complete plan in `./product/plans/ready/`. You produce plan documents only — you never write source code.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

This is an **interactive** task. Unlike the autonomous `ai/tasks/*.md` playbooks, you must stop and ask the user questions in phases — product decisions first, then UI decisions when the feature has a UI, then implementation decisions, then a final phase after the plan exists and again after its improvement passes — until every product and implementation design decision is settled. Do not guess scope, behavior, or edge cases on the user's behalf when a question would resolve it.

**Follow the steps below in order, exactly as written.** Do not skip a step, do not merge two steps together. If you are ever unsure whether you have done enough — re-read the checklist for that step before moving on, don't guess.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines, no AI authorship notes in plan files or commit messages. This overrides any default convention that appends such attribution.

**Plan and task formatting:** use natural line breaks only — do not wrap lines at a fixed column width (per `AGENTS.md`).

**Documentation scope.** User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan. A plan names no work under `documentation/user-documentation/` or `documentation/developer-documentation/`, not even as a follow-up candidate, and no phase asks the user about user or developer documentation. Specs under `./product/specs/` and in-application help under `help/` are not documentation in this sense and stay in a plan's scope. The one exception is a feature whose own title and description are about adding or updating user or developer documentation. Then documentation is the plan's primary focus, and its pages are ordinary scope, planned and questioned like any other.

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo to ground a plan in real code. Delegate `ai/tasks/feature/research-a-feature.md` to a fresh subagent in Step 2b. Create new plan files under `./product/plans/draft/`. Move the completed plan to `./product/plans/ready/` in Step 2j. Edit `./product/backlog/features.md` to remove a `### ` entry from the `## ready` section once its plan has been drafted and confirmed. Ask the user clarifying questions — this is expected, not an interruption to avoid.

### Forbidden — no exceptions

1. **Writing implementation code into a plan.** No function bodies, no JSX/CSS blocks, no "here's the code." Name the module/type/contract in prose, per `ai/tasks/planning/improve-plan.md`'s rule — the same rule applies here since you are authoring, not implementing.
2. **Editing any source, test, or config file.** This task only touches `./product/backlog/features.md` and its own plan file, under `./product/plans/draft/` and then `./product/plans/ready/`.
3. **Skipping question resolution.** Never invent a plan's scope, edge-case behavior, or UI wording without asking, when the answer is a product decision rather than something the codebase already settles. Keep asking targeted questions, one at a time, until every such decision is resolved.
4. **Promoting a plan before it is complete.** The plan stays in `./product/plans/draft/` while it is drafted, questioned, and improved, because the improvement passes in 2h look for it there. It moves to `./product/plans/ready/` only in 2j, after every box in both 2i checklists is checked.
5. **Removing a feature's entry from `./product/backlog/features.md` before its plan is complete.** Don't clear the backlog ahead of a complete plan actually existing. Never add a feature named at invocation to the file either — an unlisted feature is planned without ever passing through the backlog.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick a feature from the ready backlog

1. Read `./product/backlog/features.md` in full. Each entry under the `## ready` heading, up to the next `## ` heading, is a `### <title>` followed by its description body.
2. Pick the feature to plan:
   - **If a specific feature is named in the task invocation** (e.g. `execute ai/tasks/feature/plan-a-new-feature.md "<feature title>"`), plan that one. First look for its `### ` entry under `## ready` — the argument may be quoted text, a paraphrase, or a position such as "the second one". **If no entry matches, the named text is itself the feature**: take it at face value and plan it exactly as if it had been listed, without stopping and without adding it to the features file. A named feature is never rejected for being absent from the backlog; it simply arrives with no description body, so treat the named text as its entire description everywhere the steps below read one — and expect to ask about every question category in 2e, since nothing is pre-answered.
   - **Otherwise**, take the first `### ` entry listed under `## ready` (top of the section).
3. If `## ready` is empty **and** the invocation named no feature, report "No ready features in `./product/backlog/features.md`" and stop.
4. Copy the feature's title verbatim — do not paraphrase or shorten it; for a feature named at invocation, that is the named text as given. Say in one sentence which feature you're planning, and whether it came from the features file or from the invocation, before starting Step 2.

---

## Step 2 — Process the feature

Do not ask questions about anything other than this feature in the same `AskUserQuestion` call.

### 2a. Orient yourself in the code

Do exactly this, in order, before asking any question:

1. Grep the repo for the feature's key nouns (e.g. for "profile launcher", grep for `profile` and `picker`) to find existing related code.
2. Read any spec file under `./product/specs/` whose name matches the feature's topic.
3. If the feature's description names an existing feature as a comparison point (e.g. "just like action picker"), open that feature's implementation and read it.

Stop after these three checks — this is reconnaissance, not a design phase. Do not spend more than a few minutes here. If you find nothing related, that is a valid outcome; say so and move on to 2b.

### 2b. Research the feature

Delegate `ai/tasks/feature/research-a-feature.md` to a fresh subagent and wait for its result. Pass it a long feature description: the feature's title, its full description body (or the named text, for a feature named at invocation), and what Step 2a found, with file paths. The subagent researches online and returns a short list of the most relevant and valuable patterns, designs, strategies, techniques, tools, and libraries for this feature. Preserve every rule of that task. It edits no files and asks the user nothing.

Not every suggestion will fit. Use your own judgment and sort each one into exactly one bucket, writing the bucket and a one-line reason in your working notes:

- **Adopt** — it clearly fits the feature and the codebase. The initial draft in 2d records it under `Design decisions`, with its source URL.
- **Discard** — it clearly does not fit, duplicates what the codebase already does, or costs more than it saves. Drop it.
- **Unclear** — its appropriateness, usefulness, or need depends on a decision you can't settle from the code. Phase 3 (2g) puts it to the user, whatever the complexity checks in 2c say.

An empty list is a valid result; move on to 2c. When the subagent reports `Status: research failed`, say so in one sentence and continue planning without suggestions. A failed research run never stops this task.

### 2c. Decide whether this feature needs implementation questions

Answer these four yes/no checks about the feature, using only what the feature's `./product/backlog/features.md` text says plus what you found in 2a:

1. Does it require a **new subsystem** (not an extension of one that already exists)?
2. Does it require a **new client/server protocol message or RPC**?
3. Does it involve **concurrency, background processes, or timing/race conditions**?
4. Did Step 2a find **no close existing precedent** in the codebase to model it on?

**If you answered "yes" to any of the four, this feature is high complexity** — Phase 3 (`2g`) asks the implementation questions (where should this live, which existing mechanism does it extend or replace) after the product and UI questions are settled. **If all four are "no,"** Phase 3 carries no questions of its own — do not ask the user to make implementation decisions for a small, precedented feature. The one exception is the research suggestions 2b sorted as unclear: Phase 3 asks about those whatever these checks say.

If you are unsure whether a check is "yes" or "no," treat it as "no" — the default is product-only questions. When in doubt, ask fewer implementation questions rather than more.

### 2d. Write the initial draft

Write `./product/plans/draft/<slug>.md`, where `<slug>` is a kebab-case name derived from the feature's `### ` title (lowercase, spaces to hyphens, strip punctuation — e.g. "profile launcher" → `profile-launcher.md`). Follow `ai/guidelines/plan-template.md` for the plan's sections and each section's format and content; that template is the single owner of plan shape, so do not work from a section list copied out of an older plan. `./product/plans/ready/sql-path.md` is the plan currently in `ready/` if you want a sense of the house tone and level of detail, but the template governs structure.

The initial draft records only the feature text, facts established in Step 2a, and the research suggestions 2b sorted as adopt. Record each adopted suggestion as one bullet under `Design decisions`, naming what it is, how this feature uses it, and its source URL. Do not invent a design decision that needs the user's input. Use every section the template requires, in the template's order, with the content it prescribes for a draft at this stage. In particular, record just the UI facts Step 2a established in the `UI design` section (the surface the feature extends and the existing components it resembles), and leave that section out entirely when the feature has no UI, as the template specifies.

Do not add a `**Complexity: N/10**` line — that is `ai/tasks/planning/improve-plan.md`'s job during the later verification pass, not this task's. The template documents this as the one phase-specific exception to its common shape.

### Phased questioning — the decision tree

All questioning in this task works a **decision tree** of decisions: model every undecided point as a decision that branches into the decisions hanging off it — and treat dependencies as the tree's edges. Work the tree over what is **askable now**: every decision whose prerequisites are already settled, so asking it now requires no guess at an answer you have not yet heard. Ask **one question at a time**: pick one question from the askable set, ask it in the question format below, and wait for the user's answer before asking anything else. Never put two questions in one call. Each answer reshapes the tree: a settled decision pushes the askable frontier outward and unblocks questions that depended on it, so write the answer into the draft, recompute the askable set, and ask the next question. A question whose answer depends on another open question waits until that question is answered. Facts are your job, never the user's: when a question needs a fact from the environment (code, specs, tools), look it up yourself rather than asking the user for anything you could find there. The **decisions** are the user's — put each to them and wait.

**No limits on the number of questions.** Questions are asked without any cap — as many as the tree demands, one after another, until all the product and implementation design decisions are finalized. A phase ends only when its frontier is empty: every branch of its tree visited, nothing left silently assumed.

### Question format

Every question in every phase offers numbered answers for the user to pick from:

- **At least three concrete answers**, numbered from 1, each grounded in what Step 2a found, in a 2b research suggestion, or in an earlier answer. Never ask an open "what should happen?".
- **An "Other" answer**, numbered last, that lets the user write their own answer instead.
- **A recommendation.** Mark the answer you recommend.
- **A lowest-cost option.** Mark the answer that costs the least to build and is least likely to increase scope.

One answer may carry both marks when the answer you recommend is also the lowest-cost option. Every other answer carries neither.

### 2e. Phase 1 — resolve product decisions

Work the product-decision tree using the mechanism described above. Ask the user questions using `AskUserQuestion`, one question per call. Before the first question, make sure you have at least one question in each of these categories that isn't already answered by the feature's existing text:

- **Primary flow** — what exactly does the user do, and what do they see happen, step by step.
- **Edge cases** — what happens on the empty state, a conflict, a cancel, an error, or an unexpected input.
- **Preserved behavior** — when the feature touches an existing surface, ask exactly: "Which behaviors must continue, and what specifically must not happen?"
- **Scope boundary** — what is explicitly *not* included in this version.
- **Naming/wording** — any user-visible text (labels, commands, messages) the plan needs to fix precisely.

Skip a category only if the feature's existing description in `./product/backlog/features.md` already answers it unambiguously — quote that text back to the user as your understanding rather than silently assuming it.

Every question uses the question format above, with answers grounded in what you found in Step 2a. If a question has no natural small set of options, still propose your best-guess default as the recommended answer so the user can simply confirm it. Skip any category only if the feature's existing description in `./product/backlog/features.md` already answers it unambiguously — quote that text back to the user as your understanding rather than silently assuming it.

Keep asking questions until the phase's frontier is empty — every product decision settled, none silently assumed. After the user answers each question, update the initial draft with every answer before continuing. Each answer must become a decision, behavior, scope boundary, or exact user-visible wording in the relevant existing section.

### 2f. Phase 2 — resolve UI decisions

**This phase runs only when the feature has a UI.** `ai/guidelines/plan-template.md` defines what counts as a UI and when the plan carries a `UI design` section; apply that definition here rather than a local rule. If the feature has no UI, skip directly to 2g without asking anything here, and leave the section out of the plan as the template requires.

UI decisions hang off product decisions, so start this phase only once Phase 1's frontier is empty. Before the first question, open the existing UI surface closest to the feature (the component it extends, or the one it most resembles) and read it, so every option can name a real component, style, or convention rather than a hypothetical one.

Work the UI-decision tree using the same mechanism and no limits. Ask the user questions using `AskUserQuestion`, one question per call. Before the first question, make sure you have at least one question in each of these categories that isn't already answered by the feature's existing text or by Phase 1's answers:

- **Placement and layout** — where the UI appears (a centre tab, a docked sidebar, a popup over the command bar, a status area) and how its contents are arranged.
- **Interaction** — how the user opens, operates, and dismisses it, and where focus goes when it opens and when it closes.
- **States** — what the user sees while it is empty, loading, busy, failed, or disabled, and when content overflows (a long list, a long label, a narrow pane).
- **Keyboard and accessibility** — the key bindings it adds and whether they collide with any in `help/keys.md`, focus order, what Escape does, and the accessible name of each control.
- **Visual consistency** — which existing component, style, or theme convention it matches, named from what you just read.

Every question uses the question format above, exactly as in Phase 1. Skip a category only when the feature text or Phase 1's answers already settle it unambiguously, and quote that text back to the user as your understanding.

Keep asking questions until the phase's frontier is empty. After each answer, write it into the plan's `UI design` section as a layout, interaction, state, binding, or convention it must follow, in the format the template prescribes for that section. The template also owns what that section states about client-code placement under `ai/guidelines/react-code-organization.md` and about keeping server-owned state on the server per `ai/guidelines/architecture-principles.md` §1; do not restate those rules here.

### 2g. Phase 3 — resolve implementation decisions

**If Step 2c said this feature is high complexity**, work the implementation-decision tree with the same mechanism and no limits: one question at a time in the question format above, phrased as a choice between concrete approaches (e.g. "extend module X" vs "add a new module") — never as an open "how should this be built?" — covering where the code should live, which existing mechanism it extends or replaces, and any new protocol message or concurrency concern 2c flagged. Keep going until every implementation decision is settled, updating the draft after each answer as above.

**If all four checks said "no"**, this phase carries no implementation-decision questions of its own: the default is product-only decisions for a small, precedented feature.

**Research suggestions, whatever the complexity.** Whether or not the checks in 2c flagged anything, ask the user about every suggestion 2b sorted as unclear, one question per suggestion, in the question format above. Name the suggestion, what it would simplify or improve, its cost, and its source, and offer concrete answers such as adopting it for the whole feature, adopting it for one named part, or leaving it out. An adopted suggestion becomes a bullet under `Design decisions` with its source URL. A declined one goes under `Out of scope` when the user's reason is worth keeping, and is otherwise dropped.

When there are no implementation questions and no unclear suggestions, skip directly to 2h without asking the user anything here.

### 2h. Improve the answered draft

Run the following tasks **separately and in order**, targeting the exact draft created in 2d. Finish and report the first before starting the second:

1. Open `ai/tasks/planning/improve-plan.md` and execute every step in order, except `Step 0 — Prepare the workspace`. Verify every plan claim and referenced code path as that task requires. Complete its verification and give its `Plan / Complexity / Fixed / Open` report before proceeding.
2. Open `ai/tasks/planning/improve-plan-with-minimalism.md` and execute every step in order, except `Step 0 — Prepare the workspace`. Apply its full ladder to the plan produced by the first task. Complete its verification and give its `Plan / Complexity / Trimmed / Open` report before proceeding.

Both tasks reuse the workspace this task prepared in its own Step 0. Pass the specific draft path to each task's plan-selection step; do not let other drafts change the target. The improvement tasks edit only this plan, which remains in `draft/` throughout both passes. Note any pre-existing unrelated changes when verifying each pass and leave them untouched.

These are two task executions, not a combined review: reading the task files, adding a complexity rating, or making a general improvement pass does not complete either task. For each task, follow its own checklist, reread the resulting plan, and report its actual findings, including `Open` items. Preserve any product decisions from the feature text or the user's answers; carry new product or implementation questions into 2i rather than silently deciding them. A documentation follow-up candidate that `improve-plan.md` reports under `Open` is not a question: leave it in that report and out of 2i, per the documentation scope above. When documentation is the feature's primary focus, `improve-plan.md`'s rule against naming a documentation page does not apply to this plan, and its documentation pages stay in it.

Before starting 2i, verify both gates:

- [ ] `improve-plan.md` was run through all applicable steps and its verification and report were completed.
- [ ] `improve-plan-with-minimalism.md` was then run through all applicable steps and its verification and report were completed.

If either gate is unchecked, finish that task before continuing. If a task cannot be completed, leave the plan in `draft/`, report the incomplete task and why, and stop without promoting the plan, removing the backlog entry, or merging. Never claim a task was completed when any required step was skipped.

### 2i. Final question phase — resolve remaining and new questions

**After the plan is complete, another questioning phase occurs in order to resolve any open questions.** Read the improved plan and check this list:

- [ ] You can state the primary user flow in one or two sentences.
- [ ] You know the behavior for every edge case you identified.
- [ ] You know what is out of scope.
- [ ] You know the exact user-visible wording, if any.
- [ ] If the feature has a UI, you know its placement, interaction, every state, and its key bindings.
- [ ] The plan names no user or developer documentation work, follow-up candidates included, unless documentation is the feature's primary focus.

If every box is checked and both improvement passes surfaced nothing new, the plan is complete. Otherwise, work one more decision-tree phase over: the unchecked items, plus any new questions the improvement passes raised — new and remaining decisions alike join the same tree. Unchecked items with no dependency are askable now; items whose answers hang on another open question wait until that question is answered, with no limit on questions. Ask them one at a time in the question format above. Target only the open items, and apply every answer to the draft, then re-read it and repeat this step. Continue until every box is checked and nothing surfaced remains unresolved; do not leave unresolved product or implementation decisions in the plan.

Before moving on, check the completed plan against this list:

- [ ] No code blocks containing function bodies, JSX, or CSS.
- [ ] The plan has every section `ai/guidelines/plan-template.md` requires, in the template's order, with `UI design` present only when the feature has a UI.
- [ ] Every product decision traces back to either the feature text, established behavior, or a user answer.
- [ ] Every question identified by the final review is resolved in the plan.
- [ ] Every preservation claim in the plan has a negative assertion and a named test.
- [ ] Both improvement tasks passed their separate 2h gates before this review.

### 2j. Promote the completed plan

Once every box in both 2i checklists is checked, move the plan from `./product/plans/draft/` to `./product/plans/ready/`. It is complete and ready to implement. Use plain `mv` (not `git mv`) — the new plan file is not tracked by git yet, and `git mv` fails on an untracked file:

```bash
mv ./product/plans/draft/<slug>.md ./product/plans/ready/<slug>.md
```

### 2k. Remove the entry from the backlog

Edit `./product/backlog/features.md` to remove that feature's `### ` entry (title and body) from the `## ready` section. Leave every other section, heading, and entry byte-for-byte untouched — do not reformat or reflow surrounding text. If the feature came from the task invocation and was never listed in the file, there is nothing to remove: leave the file untouched.

### 2l. Merge the completed plan

Once the promoted plan and backlog update are complete, execute `ai/tasks/workspace/merge-change-to-master.md` in full.

Do not stop for approval between these tasks. The merge task packages and merges the completed plan.

---

## Step 3 — Report

After the feature is processed (planned, or explicitly abandoned during its questioning phases), give the user a short report in this shape:

```
Feature:  <feature title>
Planned:  ./product/plans/ready/<file> — <one-line goal>
Skipped:  <why, if abandoned instead of planned>
Backlog:  ./product/backlog/features.md updated, entry removed from ## ready — or "not listed; nothing to remove" for a feature named at invocation
Merged:   <status and PR reported by ai/tasks/workspace/merge-change-to-master.md>
```

Keep it brief. Done.
