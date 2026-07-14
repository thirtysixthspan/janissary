# Plan Ready Features

Your job: walk the `## ready` section of `product/development/features.md` one feature at a time, interview the user with product-focused questions to pin down scope and behavior, and write a draft plan for each into `product/plans/draft/`. You produce plan documents only — you never write source code.

This is an **interactive** task. Unlike the autonomous `ai/tasks/*.md` playbooks, you must stop and ask the user questions before drafting each plan. Do not guess scope, behavior, or edge cases on the user's behalf when a question would resolve it.

**Follow the steps below in order, exactly as written, one feature at a time.** Do not skip a step, do not merge two steps together, and do not process more than one feature between Step 2a and Step 2f. If you are ever unsure whether you have done enough — re-read the checklist for that step before moving on, don't guess.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines, no AI authorship notes in plan files or commit messages. This overrides any default convention that appends such attribution.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no subshell captures, no redirects/pipes for anything other than the documented `./temp/` capture pattern in `CLAUDE.md`. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

**Plan and task formatting:** use natural line breaks only — do not wrap lines at a fixed column width (per `CLAUDE.md`).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo to ground a plan in real code. Create new plan files under `product/plans/draft/`. Edit `product/development/features.md` to remove a `### ` entry from the `## ready` section once its plan has been drafted and confirmed. Ask the user clarifying questions — this is expected, not an interruption to avoid.

### Forbidden — no exceptions

1. **Writing implementation code into a plan.** No function bodies, no JSX/CSS blocks, no "here's the code." Name the module/type/contract in prose, per `ai/tasks/improve-plan.md`'s rule — the same rule applies here since you are authoring, not implementing.
2. **Editing any source, test, or config file.** This task only touches `product/development/features.md` and files under `product/plans/draft/`.
3. **Skipping the question round.** Never invent a plan's scope, edge-case behavior, or UI wording without asking, when the answer is a product decision rather than something the codebase already settles.
4. **Moving a plan to `product/plans/ready/`.** That promotion is a separate human/`ai/tasks/improve-plan.md` step. Everything this task produces lands in `product/plans/draft/`.
5. **Removing a feature's entry from `product/development/features.md` before its plan is drafted and the user has confirmed it.** Don't clear the backlog ahead of the plan actually existing.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Read the ready backlog

1. Read `product/development/features.md` in full.
2. Extract every entry under the `## ready` heading, up to the next `## ` heading. Each entry is a `### <title>` followed by its description body. Copy titles verbatim — do not paraphrase or shorten them.
3. If the `## ready` section is empty, report "No ready features in `product/development/features.md`" and stop.
4. Write down the exact ordered list of feature titles as a numbered list in your own working notes, e.g.:
   ```
   1. profile launcher
   2. developer documentation
   ```
   This is your queue for Step 2. Process it top to bottom. Do not reorder it, do not pick "the easy one first."
5. Show this numbered list to the user before starting Step 2, so they can see the queue.

---

## Step 2 — Process one feature at a time

Work through the numbered queue from Step 1 **strictly in order, one entry at a time**. Do not start feature 2 until feature 1 has reached Step 2f (planned) or has been explicitly abandoned. Do not ask questions about multiple features in the same `AskUserQuestion` call — one call, one feature.

Before starting each feature, say in one sentence which feature (by number and title) you are now working on.

### 2a. Orient yourself in the code

Do exactly this, in order, before asking any question:

1. Grep the repo for the feature's key nouns (e.g. for "profile launcher", grep for `profile` and `picker`) to find existing related code.
2. Read any spec file under `product/specs/` whose name matches the feature's topic.
3. If the feature's description names an existing feature as a comparison point (e.g. "just like action picker"), open that feature's implementation and read it.

Stop after these three checks — this is reconnaissance, not a design phase. Do not spend more than a few minutes here. If you find nothing related, that is a valid outcome; say so and move on to 2b.

### 2b. Decide whether this feature needs implementation questions

Answer these four yes/no checks about the feature, using only what the feature's `product/development/features.md` text says plus what you found in 2a:

1. Does it require a **new subsystem** (not an extension of one that already exists)?
2. Does it require a **new client/server protocol message or RPC**?
3. Does it involve **concurrency, background processes, or timing/race conditions**?
4. Did Step 2a find **no close existing precedent** in the codebase to model it on?

**If you answered "yes" to any of the four, this feature is high complexity** — include a small number of implementation questions (where should this live, which existing mechanism does it extend or replace) alongside the product questions in 2c. **If all four are "no," ask only product/behavioral questions** — do not ask the user to make implementation decisions for a small, precedented feature.

If you are unsure whether a check is "yes" or "no," treat it as "no" — the default is product-only questions. When in doubt, ask fewer implementation questions rather than more.

### 2c. Ask clarifying questions

Ask the user questions using `AskUserQuestion`, one call per round, **maximum 4 questions per call**. Before writing questions, make sure you have at least one question in each of these categories that isn't already answered by the feature's existing text:

- **Primary flow** — what exactly does the user do, and what do they see happen, step by step.
- **Edge cases** — what happens on the empty state, a conflict, a cancel, an error, or an unexpected input.
- **Scope boundary** — what is explicitly *not* included in this version.
- **Naming/wording** — any user-visible text (labels, commands, messages) the plan needs to fix precisely.

Skip a category only if the feature's existing description in `product/development/features.md` already answers it unambiguously — quote that text back to the user as your understanding rather than silently assuming it.

Every question must offer concrete options grounded in what you found in Step 2a, rather than an open-ended "what should happen?". If a question has no natural small set of options, still propose your best-guess default as one of the options so the user can simply confirm it.

Only if Step 2b said this feature is high complexity, add up to 2 implementation questions in the same call, phrased as a choice between concrete approaches (e.g. "extend module X" vs "add a new module") — never as an open "how should this be built?".

After the user answers, check this list before deciding you're done:

- [ ] You can state the primary user flow in one or two sentences.
- [ ] You know the behavior for every edge case you identified.
- [ ] You know what is out of scope.
- [ ] You know the exact user-visible wording, if any.

If any box is unchecked, ask one more round (max 4 questions) targeting only the unchecked items. Do not exceed 3 rounds total for one feature — if something is still unresolved after 3 rounds, write it into the plan's "Open questions" section instead of continuing to ask.

### 2d. Draft the plan

Write `product/plans/draft/<slug>.md`, where `<slug>` is a kebab-case name derived from the feature's `### ` title (lowercase, spaces to hyphens, strip punctuation — e.g. "profile launcher" → `profile-launcher.md`). Follow the house style used in `product/plans/ready/` (skim an existing one, e.g. `product/plans/ready/monitor-page-tab-content-feed.md`, for shape). The plan file must contain, in this order, every one of these sections — do not omit any:

1. `# <Feature name>` title.
2. A short summary paragraph: what the feature does and why, folding in what the user told you in 2c.
3. Design decisions, stated as decisions (not hedged with "maybe"/"either") — drawn directly from the user's answers. Every question you asked in 2c should map to one decision here.
4. A "What already exists (reuse, don't rebuild)" table when Step 2a surfaced precedent to point at. If 2a found nothing relevant, write "None found" rather than omitting the section.
5. Proposed changes, described in prose (module/function/type names and their contracts) — no code blocks.
6. Tests section naming what should be covered and where (mirroring existing test conventions for the touched area).
7. Out of scope, listing what the user said is explicitly deferred.
8. Open questions — anything still genuinely unresolved after 2c (write "None" if nothing remains).
9. Verification section: `./scripts/run.mjs check-diff` plus a concrete manual check.

Do not add a `**Complexity: N/10**` line — that is `ai/tasks/improve-plan.md`'s job during the later verification pass, not this task's.

Before moving on, check the plan file against this list:

- [ ] No code blocks containing function bodies, JSX, or CSS.
- [ ] All 9 sections above are present, in order.
- [ ] Every design decision traces back to something the user actually said in 2c, not an assumption you made.

### 2e. Confirm with the user

Show the user a brief summary of the drafted plan (goal, key decisions, out-of-scope boundary) and confirm it matches what they described. If they want changes, edit the plan and show the summary again — repeat until confirmed. If they want to abandon the feature entirely, delete `product/plans/draft/<slug>.md` if you already wrote it, leave the entry in `product/development/features.md` untouched, note it as skipped, and move to the next feature in the queue.

### 2f. Remove the entry from the backlog

Once confirmed, edit `product/development/features.md` to remove that feature's `### ` entry (title and body) from the `## ready` section. Leave every other section, heading, and entry byte-for-byte untouched — do not reformat or reflow surrounding text.

Only after this step is complete, return to the top of Step 2 for the next feature in the queue.

---

## Step 3 — Report

After all ready features are processed (planned or explicitly skipped per 2e), give the user a short report in this shape:

```
Processed:  N ready features
Planned:    product/plans/draft/<file> — <one-line goal>   (repeat per feature)
Skipped:    <feature title> — <why, if any were abandoned>
Backlog:    product/development/features.md updated, N entries removed from ## ready
```

Keep it brief. Done.
