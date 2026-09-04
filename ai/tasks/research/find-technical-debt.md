# Find Technical Debt

Your job: read through the codebase and use your own judgment to spot likely sources of technical debt — code smells, architecture drift, inconsistency, and maintenance risk — then log what you find as new entries, in the structured format Step 4 defines, under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** debt; it does not fix it, and other tasks own resolving what lands here ([`resolve-technical-debt.md`](../resolve-technical-debt.md), [`reduce-complexity.md`](../hygiene/reduce-complexity.md), [`remove-deadcode.md`](../hygiene/remove-deadcode.md), [`remove-duplication.md`](../hygiene/remove-duplication.md), [`improve-modularity.md`](../hygiene/improve-modularity.md)).

**Never run repository tools to assess debt.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run quality`, `./scripts/run.mjs check-diff`, FTA, or any other build/lint/test/analysis tooling — not even the diff-scoped fast commands. Those tools already have dedicated tasks that consume their output. This task's job is to **read the code yourself** and make a judgment call, the same way a human reviewer skimming the codebase would. Plain read-only shell commands used only to navigate (`ls`, `wc -l`, `grep`, `git log`) are fine — the restriction is on running the project's build/lint/test/quality machinery, not on looking at files.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — how to reason about debt

This task follows the common industry framing of technical debt, so keep it in mind while reading code and writing entries:

- **Debt has a type, not just a size.** Fowler's technical debt quadrant classifies debt along two axes: was it taken on *deliberately* or *inadvertently*, and was the choice *prudent* or *reckless*? Deliberate-and-prudent debt ("we know this cuts a corner, but shipping now is worth it, and we can see the payoff") is a normal, healthy trade-off — it is not automatically worth logging on its own. What belongs in this backlog is debt whose "interest" is visibly compounding now: reckless shortcuts, inadvertent debt from outdated assumptions or code that never caught up with a later architectural decision, and anything that makes nearby changes harder or riskier than they should be. Use this lens to decide whether a candidate is worth logging at all, and to write its `Existing Debt` and its two risk paragraphs in Step 4.
- **A code smell is a symptom, not the debt itself.** The established smell taxonomy (long methods, duplicated code, large/"blob" classes mixing unrelated responsibilities, deep conditional nesting, inconsistent error-handling styles) is a reliable way to *find* debt by reading, but the debt is the underlying design gap the smell points to. An entry that names the cause ("no shared validation layer, so each route hand-rolls its own checks") is more useful than one that only names the symptom ("duplicated code in routes").
- **Debt worth logging is debt worth resolving safely and incrementally.** The tasks that consume this backlog resolve debt through small, verifiable steps — contain the area, keep it under test, refactor, verify behavior didn't change — rather than large rewrites, mirroring the boy-scout rule (leave code a little better, in small steps) and, for anything large enough to need staged replacement, the strangler-fig pattern (build the replacement alongside the old code and cut over incrementally). Size each entry as a single unit of work someone could pick up and finish in one sitting, not "rewrite module X" or "redesign the architecture."
- **Prioritize like the debt has a cost, not just a badness score.** Industry guidance weighs debt by business impact/risk against remediation effort, favoring high-impact/low-effort items — this is why Step 3 caps the run and asks you to keep the entries most likely to cause real harm or slow down future work, not just the most numerous. The entry format in Step 4 records that judgment in numbers: how bad the debt is today (the `Existing Debt` severity) and how much safer the code gets once the work is done (the drop from `Existing Risk` to `Proposal Risk`).

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. It has three flat sections — `## ready`, `## development`, `## deferred` — each a `*` bullet list with no IDs.

Entries appear in more than one shape, and all of them count. Older entries are a single free-form paragraph ending in a severity rating; newer ones follow the structured format Step 4 defines, where the `*` bullet carries a one-sentence summary and labeled paragraphs beneath it carry the rest. Read whichever you find as written — you are not migrating the old ones.

Collect every existing entry from all three sections into one list, identifying each by its lead `*` bullet — the summary line of a structured entry, the whole bullet of an older paragraph one. This is the dedupe set: nothing you add in Step 5 may restate an item already present anywhere in the file, even worded differently. If the same underlying issue is already listed (in any section), skip it.

---

## Step 2 — Read the code and form candidates

Read broadly across `src/` and `web/src/`, using your own judgment — not a tool's — to spot technical debt. The signals below are drawn from the established code-smell taxonomy (Fowler's *Refactoring* catalog and the empirical literature on maintainability) — treat each as something to notice while reading, then ask *what design gap produced this?* before writing it down:

- **Size and shape.** Files at or near the 200-line limit in [`ai/guidelines/code-guidelines.md`](../../guidelines/code-guidelines.md) (`wc -l` is fine to check this), files that visibly mix unrelated responsibilities, or functions that read as doing too many things at once.
- **Duplication.** The same logic, validation, or shape of code repeated across multiple files instead of shared — read the files side by side to judge similarity, don't rely on a duplication detector.
- **Inconsistency.** Two places that solve the same kind of problem in different ways (e.g. one module handles errors by throwing, another by returning a result type; inconsistent naming for the same concept across files).
- **Markers left in code.** `TODO`, `FIXME`, `HACK`, `XXX` comments, commented-out code blocks, and stale comments that no longer match the code beside them.
- **Coupling and architecture drift.** Modules that reach into another module's internals instead of its public surface, circular-feeling dependencies, or code that no longer matches the shape described in `product/specs/` or `ai/guidelines/`.
- **Type and safety erosion.** Liberal use of `any`, type assertions used to silence a mismatch rather than express a real invariant, or unsafe patterns that suggest the types stopped being trusted.
- **Test gaps you can see by inspection.** A module with clearly risky logic (parsing, state transitions, error paths) sitting next to a test file that only covers the happy path, or no colocated test file at all for a non-trivial module.

You do not need to cover the entire codebase exhaustively in one run — read enough of `src/` and `web/src/` (favor areas you have not looked at recently, or that recent `git log` activity suggests are churning) to form a genuine, evidence-based list. Skim broadly first, then read closely wherever something looks off.

For every candidate, note the file(s) it lives in and the specific thing you observed — you need this to write a concrete entry in Step 4.

---

## Step 3 — Bound the run

Cap this run at **10 new entries**. If you find more genuine candidates than that, keep the 10 you judge most impactful (most files touched, most likely to cause a real bug or slow down future work, most visibly inconsistent with the project's own guidelines) and leave the rest for the next run — do not pad the list with marginal findings just to hit the cap, and do not exceed it.

If you find zero genuine candidates after a good-faith read, that is a valid outcome — do not invent debt that isn't there.

---

## Step 4 — Write each entry

Every entry is one `*` bullet carrying a one-sentence summary, followed by four labeled paragraphs — `Existing Debt`, `Existing Risk`, `Proposal Risk`, `Proposal`, in that order and no other. Nothing is indented and nothing is bolded: every part sits flush at the left margin with a plain-text label, and a blank line separates it from the part before. No IDs, no extra parts beyond these five, and no scores beyond the three the template names:

```
* <one sentence, glanceable>

Existing Debt: <one sentence> Severity: <N>/10

Existing Risk: <N>/10 - <one sentence>

Proposal Risk: <N>/10 - <one sentence>

Proposal: <the detailed plan, with code references an agent can act on>
```

The `*` bullet is the entry's identity line — it is what a reader scans, and what other tasks quote when they list, defer, or resolve the item — so it has to stand on its own without the paragraphs beneath it. Those paragraphs belong to it: an entry begins at its `*` bullet and runs through its `Proposal` paragraph, and the next `*` bullet begins the next entry.

Separate one entry from the next with **two** blank lines, not one. A single blank line separates an entry's own parts, so the wider gap is what makes the boundary between entries visible when scanning a long section — without it, a `Proposal` paragraph and the `*` bullet that follows it read as one run of text.

This format is intentionally copied in [`pull-request-review.md`](../pull-request-review.md), which restates it so a task stands alone rather than sending its reader to another file mid-run — a change to the format or to either scale belongs in both. The two differ on purpose in exactly two places: the first labeled paragraph is `Existing Debt` here and `Existing Issue` there, and the severity scale below is reworded there for pull-request review while the risk scale is identical in both.

### The five parts

- **The summary bullet.** One sentence summarizing the whole proposal, readable at a glance: what would be done and roughly how much of the codebase it reaches. It carries no label. Write it as a change, not as a complaint. Keep it free of paths — the scope belongs in words ("across the picker overlays", "in the websocket client layer") and the file references belong in the `Proposal` paragraph.
- **Existing Debt.** One sentence naming the technical debt that exists today within the proposal's scope — the design gap behind the smell (per Background), not just the symptom — then a **debt severity** score from the scale below, written as a trailing `Severity: <N>/10` after that sentence's full stop. Describe what *is*, not what should be done about it; the fix is the `Proposal` paragraph's job.
- **Existing Risk.** An **existing risk** score, then ` - `, then one sentence on what the debt risks if it is never resolved: the bug it invites, the incident it enables, the change it will make dangerous later.
- **Proposal Risk.** A **proposed risk** score, then ` - `, then one sentence on the risk the code still carries once the work has landed. Both risk paragraphs come before the plan they judge, so write each to stand on its own for a reader who has not reached the `Proposal` paragraph yet — name the hazard rather than pointing back at a step they have not read.
- **Proposal.** The detailed plan, and the only long part. Write it for the audience that will actually use it: an AI agent that has not read the code, opening this entry cold and expected to execute the work successfully from what it says. That means concrete code references — the modules, files, directories, functions, and call sites involved, each named by path — plus what changes in each one, what the resulting shape should be, and which existing tests cover the behavior that must not move. Reference files by path only, never by line number: the files move, the facts don't. Where a step could regress behavior nothing covers, say so here beside the step. Multiple sentences are expected; keep it to one paragraph. Per Background, scope it as a single unit of work an agent could finish and verify in one sitting — when an area is too large for that, propose the first safe increment rather than the whole rewrite.

"Low risk" is not a risk. If you genuinely see none in either risk paragraph, say what would make it visible if you were wrong.

### The scales

Both scales run 1–10. Score the **debt severity** by how much the design gap is costing the project now:

| Debt severity | Meaning |
|---------------|---------|
| **1–3** | Cosmetic or contained: an inconsistency, a small duplication, a stale comment. Nothing compounds; nearby work is unaffected. |
| **4–7** | A real design gap that makes nearby changes cost more — a missing shared abstraction, an eroded type boundary, a pattern each new caller has to re-implement. Interest is accruing on a path people touch. |
| **8–10** | Reckless or actively compounding debt on a core, high-churn path: every change through the area is now slower and riskier, and the cost is visibly growing run over run. |

Score both **risk** values on one scale — likelihood times blast radius, judged against the code as it stands (`Existing Risk`) and as it would stand after the work (`Proposal Risk`):

| Risk | Meaning |
|------|---------|
| **1–3** | Unlikely to bite, or bites harmlessly: a cosmetic glitch, an edge case behind a rarely-taken branch, something a test would catch first. |
| **4–7** | Plausible failure in normal use with real user-visible consequences — a broken interaction, a stale view, data that has to be re-entered — but recoverable and contained to one area. |
| **8–10** | Likely, or catastrophic when it happens: data loss, silent corruption, a security or sandbox weakness, or a failure that takes out a core path for every user. |

**The two risk scores are the case for the work.** `Proposal Risk` should come in materially below `Existing Risk`; if it does not, the proposal is not buying enough to be worth logging — either sharpen it or drop the candidate. Never close the gap by scoring optimistically: if the work relocates the risk rather than reducing it, say so in the `Proposal Risk` sentence and let the two numbers sit close together.

### Worked example

```
* Hand the server's state snapshot to the web client as the one object it already is, instead of unpacking it into a sixteen-argument positional callback.

Existing Debt: The wire contract defines the state snapshot once as a named record, and the client immediately flattens it into a positional parameter list whose order does not match the record's and whose optionality disagrees with it, so field identity survives on the wire and is lost the moment it lands. Severity: 6/10

Existing Risk: 5/10 - Two adjacent same-typed fields swapped in the positional call — the two `string` theme fields, the two `number` name-length limits — typecheck and ship, putting the syntax theme where the app theme belongs with no test able to tell the difference.

Proposal Risk: 2/10 - Fields are matched by name and a rename is a compile error, but the snapshot is still fanned out into fifteen separate `useState` setters, so an added field still means an added setter and an added dependency-array entry.

Proposal: `StateEvent` in `src/protocol/events.ts` carries sixteen named payload fields. `StateListener` in `web/src/ws.ts` re-declares them as sixteen positional parameters in a different order — `harnessLaunch` and `scheduleLaunch` are the second and third fields of the event but the fourteenth and fifteenth parameters here — and `activeTabNameMaxLength` is required on the event but optional in the listener; `JanusClient.onEvent`'s `state` arm then spreads the event across that call by hand. The sole real subscriber, `useServerState` in `web/src/useServerState.ts`, destructures all sixteen positionally on one line and re-supplies a `= 50` default the event can never need. Change `StateListener` to take the `StateEvent` (or a narrowed object type exported beside it), delete the positional spread in `onEvent`, and have `useServerState` destructure by name; the two `?? null` normalizations `onEvent` applies to `route` and the launch views belong in that same place with the comment explaining why `route` must be `null` rather than `undefined`. `web/src/App.test.tsx` builds a fake client deliberately typed against `StateListener` so a signature change is a type error there, and `web/src/useServerState.test.ts` derives the listener type from `onState`; both pin the current fan-out and must keep passing.
```

---

## Step 5 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new entries to the end of the `## development` section only. Leave `## ready` and `## deferred` exactly as they are — do not reorder, reword, reformat, or remove anything in any section, including `## development`'s existing entries. Older paragraph-form entries stay exactly as written; the new format applies to what you add, not to what is already there.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new entry carries all five parts, in order — the `*` summary bullet, then `Existing Debt`, `Existing Risk`, `Proposal Risk`, and `Proposal` — each unindented, each separated by a blank line, with all three scores present.
   Two blank lines separate each entry's `Proposal` paragraph from the next entry's `*` bullet, so each entry reads as one block running from its bullet to its plan and the boundary between blocks is wider than the gaps inside them.
4. None of the new entries duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log new technical debt findings
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Existing entries:  <count found in Step 1, across all sections>
New entries added: <count> (to product/backlog/technical-debt.md, ## development)
Entries:           <one line per new entry: its summary bullet, debt severity, and existing → proposal risk — or "none found">
Commit:            <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
