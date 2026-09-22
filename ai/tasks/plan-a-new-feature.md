# Plan a New Feature

Your job: pick one feature — the first entry under the `## ready` section of `./product/backlog/features.md`, or a specific feature named in the task invocation, which need not be listed there at all — write an initial draft plan for it into `./product/plans/draft/`, resolve its product decisions with the user, and leave a complete plan. You produce plan documents only — you never write source code.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

This is an **interactive** task. Unlike the autonomous `ai/tasks/*.md` playbooks, you must stop and ask the user questions in phases — product decisions first, then implementation decisions, then a final phase after the plan exists and again after its improvement passes — until every product and implementation design decision is settled. Do not guess scope, behavior, or edge cases on the user's behalf when a question would resolve it.

**Follow the steps below in order, exactly as written.** Do not skip a step, do not merge two steps together. If you are ever unsure whether you have done enough — re-read the checklist for that step before moving on, don't guess.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines, no AI authorship notes in plan files or commit messages. This overrides any default convention that appends such attribution.

**Plan and task formatting:** use natural line breaks only — do not wrap lines at a fixed column width (per `AGENTS.md`).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo to ground a plan in real code. Create new plan files under `./product/plans/draft/`. Edit `./product/backlog/features.md` to remove a `### ` entry from the `## ready` section once its plan has been drafted and confirmed. Ask the user clarifying questions — this is expected, not an interruption to avoid.

### Forbidden — no exceptions

1. **Writing implementation code into a plan.** No function bodies, no JSX/CSS blocks, no "here's the code." Name the module/type/contract in prose, per `ai/tasks/planning/improve-plan.md`'s rule — the same rule applies here since you are authoring, not implementing.
2. **Editing any source, test, or config file.** This task only touches `./product/backlog/features.md` and files under `./product/plans/draft/`.
3. **Skipping question resolution.** Never invent a plan's scope, edge-case behavior, or UI wording without asking, when the answer is a product decision rather than something the codebase already settles. Keep asking targeted rounds until every such decision is resolved.
4. **Moving a plan to `./product/plans/ready/`.** That promotion is a separate human/`ai/tasks/planning/improve-plan.md` step. Everything this task produces lands in `./product/plans/draft/`.
5. **Removing a feature's entry from `./product/backlog/features.md` before its plan is complete.** Don't clear the backlog ahead of a complete plan actually existing. Never add a feature named at invocation to the file either — an unlisted feature is planned without ever passing through the backlog.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick a feature from the ready backlog

1. Read `./product/backlog/features.md` in full. Each entry under the `## ready` heading, up to the next `## ` heading, is a `### <title>` followed by its description body.
2. Pick the feature to plan:
   - **If a specific feature is named in the task invocation** (e.g. `execute ai/tasks/plan-a-new-feature.md "<feature title>"`), plan that one. First look for its `### ` entry under `## ready` — the argument may be quoted text, a paraphrase, or a position such as "the second one". **If no entry matches, the named text is itself the feature**: take it at face value and plan it exactly as if it had been listed, without stopping and without adding it to the features file. A named feature is never rejected for being absent from the backlog; it simply arrives with no description body, so treat the named text as its entire description everywhere the steps below read one — and expect to ask about every question category in 2d, since nothing is pre-answered.
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

### 2b. Decide whether this feature needs implementation questions

Answer these four yes/no checks about the feature, using only what the feature's `./product/backlog/features.md` text says plus what you found in 2a:

1. Does it require a **new subsystem** (not an extension of one that already exists)?
2. Does it require a **new client/server protocol message or RPC**?
3. Does it involve **concurrency, background processes, or timing/race conditions**?
4. Did Step 2a find **no close existing precedent** in the codebase to model it on?

**If you answered "yes" to any of the four, this feature is high complexity** — Phase 2 (`2e`) asks the implementation questions (where should this live, which existing mechanism does it extend or replace) after Phase 1's product questions are settled. **If all four are "no,"** Phase 2 carries no questions — do not ask the user to make implementation decisions for a small, precedented feature.

If you are unsure whether a check is "yes" or "no," treat it as "no" — the default is product-only questions. When in doubt, ask fewer implementation questions rather than more.

### 2c. Write the initial draft

Write `./product/plans/draft/<slug>.md`, where `<slug>` is a kebab-case name derived from the feature's `### ` title (lowercase, spaces to hyphens, strip punctuation — e.g. "profile launcher" → `profile-launcher.md`). Follow the house style used in `./product/plans/ready/` (skim an existing one, e.g. `./product/plans/ready/monitor-page-tab-content-feed.md`, for shape).

The initial draft records only the feature text and facts established in Step 2a. Do not invent a design decision that needs the user's input. It must contain, in this order:

1. `# <Feature name>` title.
2. A short summary paragraph describing the known goal and why it matters.
3. Design decisions established by the feature text or existing behavior.
4. A "What already exists (reuse, don't rebuild)" table when Step 2a surfaced precedent to point at. If 2a found nothing relevant, write "None found" rather than omitting the section.
5. Proposed changes, described in prose (module/function/type names and their contracts) — no code blocks.
6. Tests section naming what should be covered and where (mirroring existing test conventions for the touched area).
7. Out of scope, listing boundaries already established by the feature text.
8. Verification section: `$janissary/scripts/run.mjs check-diff` plus a concrete manual check.

Do not add a `**Complexity: N/10**` line — that is `ai/tasks/planning/improve-plan.md`'s job during the later verification pass, not this task's.

### Phased questioning — the decision tree

All questioning in this task works a **decision tree** of decisions: model every undecided point as a decision that branches into the decisions hanging off it — and treat dependencies as the tree's edges. Work the tree in **rounds** over what is **askable now**: every decision whose prerequisites are already settled, so asking it now requires no guess at an answer you have not yet heard. Ask the whole askable set in one round — number each question and give your **recommended answer** for each — then wait for the user's answers before the next round. Each round's answers reshape the tree: settled decisions push the askable frontier outward and unblock questions that depended on them, so recompute the askable set and ask the next round. A question whose answer depends on another question still open in the round belongs to a **later** round, not this one. Facts are your job, never the user's: when a question needs a fact from the environment (code, specs, tools), look it up yourself rather than asking the user for anything you could find there. The **decisions** are the user's — put each to them and wait.

**No limits on the number of questions.** Questions are asked without any cap — as many as the tree demands, one after another, until all the product and implementation design decisions are finalized. A phase ends only when its frontier is empty: every branch of its tree visited, nothing left silently assumed.

### 2d. Phase 1 — resolve product decisions

Work the product-decision tree using the mechanism described above. Ask the user questions using `AskUserQuestion`, one call per round. Before the first round, make sure you have at least one question in each of these categories that isn't already answered by the feature's existing text:

- **Primary flow** — what exactly does the user do, and what do they see happen, step by step.
- **Edge cases** — what happens on the empty state, a conflict, a cancel, an error, or an unexpected input.
- **Scope boundary** — what is explicitly *not* included in this version.
- **Naming/wording** — any user-visible text (labels, commands, messages) the plan needs to fix precisely.

Skip a category only if the feature's existing description in `./product/backlog/features.md` already answers it unambiguously — quote that text back to the user as your understanding rather than silently assuming it.

Every question must offer concrete options grounded in what you found in Step 2a, rather than an open-ended "what should happen?". If a question has no natural small set of options, still propose your best-guess default as one of the options so the user can simply confirm it. Skip any category only if the feature's existing description in `./product/backlog/features.md` already answers it unambiguously — quote that text back to the user as your understanding rather than silently assuming it.

Keep asking rounds until the phase's frontier is empty — every product decision settled, none silently assumed. After the user answers each round, update the initial draft with every answer before continuing. Each answer must become a decision, behavior, scope boundary, or exact user-visible wording in the relevant existing section.

### 2e. Phase 2 — resolve implementation decisions

**If Step 2b said this feature is high complexity**, work the implementation-decision tree with the same mechanism and no limits: rounds of numbered questions, each with your recommended answer, phrased as a choice between concrete approaches (e.g. "extend module X" vs "add a new module") — never as an open "how should this be built?" — covering where the code should live, which existing mechanism it extends or replaces, and any new protocol message or concurrency concern 2b flagged. Keep going until every implementation decision is settled, updating the draft after each round as above.

**If all four checks said "no"**, this phase carries no questions to ask: the default is product-only decisions for a small, precedented feature, so skip directly to 2f without asking the user anything here.

### 2f. Improve the answered draft

Execute these tasks in order and in full:

1. `ai/tasks/planning/improve-plan.md`
2. `ai/tasks/planning/improve-plan-with-minimalism.md`

The improvement passes may uncover product or implementation decisions the draft has not settled. Continue to the next step after both passes complete.

### 2g. Final question phase — resolve remaining and new questions

**After the plan is complete, another questioning phase occurs in order to resolve any open questions.** Read the improved plan and check this list:

- [ ] You can state the primary user flow in one or two sentences.
- [ ] You know the behavior for every edge case you identified.
- [ ] You know what is out of scope.
- [ ] You know the exact user-visible wording, if any.

If every box is checked and both improvement passes surfaced nothing new, the plan is complete. Otherwise, work one more decision-tree phase over: the unchecked items, plus any new questions the improvement passes raised — new and remaining decisions alike join the same tree. Unchecked items with no dependency are askable now; items whose answers hang on another open question wait for a later round in this phase, with no limit on rounds. Target only the open items, and apply every answer to the draft, then re-read it and repeat this step. Continue until every box is checked and nothing surfaced remains unresolved; do not leave unresolved product or implementation decisions in the plan.

Before moving on, check the completed plan against this list:

- [ ] No code blocks containing function bodies, JSX, or CSS.
- [ ] All 8 sections above are present, in order.
- [ ] Every product decision traces back to either the feature text, established behavior, or a user answer.
- [ ] Every question identified by the final review is resolved in the plan.

### 2h. Remove the entry from the backlog

Edit `./product/backlog/features.md` to remove that feature's `### ` entry (title and body) from the `## ready` section. Leave every other section, heading, and entry byte-for-byte untouched — do not reformat or reflow surrounding text. If the feature came from the task invocation and was never listed in the file, there is nothing to remove: leave the file untouched.

### 2i. Merge the completed plan

Once the completed draft plan and backlog update are complete, execute `ai/tasks/workspace/merge-change-to-master.md` in full.

Do not stop for approval between these tasks. The merge task packages and merges the completed plan.

---

## Step 3 — Report

After the feature is processed (planned, or explicitly abandoned during its questioning phases), give the user a short report in this shape:

```
Feature:  <feature title>
Planned:  ./product/plans/draft/<file> — <one-line goal>
Skipped:  <why, if abandoned instead of planned>
Backlog:  ./product/backlog/features.md updated, entry removed from ## ready — or "not listed; nothing to remove" for a feature named at invocation
Merged:   <status and PR reported by ai/tasks/workspace/merge-change-to-master.md>
```

Keep it brief. Done.
