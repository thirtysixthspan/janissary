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

- **Debt has a type, not just a size.** Fowler's technical debt quadrant classifies debt along two axes: was it taken on *deliberately* or *inadvertently*, and was the choice *prudent* or *reckless*? Deliberate-and-prudent debt ("we know this cuts a corner, but shipping now is worth it, and we can see the payoff") is a normal, healthy trade-off — it is not automatically worth logging on its own. What belongs in this backlog is debt whose "interest" is visibly compounding now: reckless shortcuts, inadvertent debt from outdated assumptions or code that never caught up with a later architectural decision, and anything that makes nearby changes harder or riskier than they should be. Use this lens to decide whether a candidate is worth logging at all, and to write its **Benefits** and **Risks** in Step 4.
- **A code smell is a symptom, not the debt itself.** The established smell taxonomy (long methods, duplicated code, large/"blob" classes mixing unrelated responsibilities, deep conditional nesting, inconsistent error-handling styles) is a reliable way to *find* debt by reading, but the debt is the underlying design gap the smell points to. An entry that names the cause ("no shared validation layer, so each route hand-rolls its own checks") is more useful than one that only names the symptom ("duplicated code in routes").
- **Debt worth logging is debt worth resolving safely and incrementally.** The tasks that consume this backlog resolve debt through small, verifiable steps — contain the area, keep it under test, refactor, verify behavior didn't change — rather than large rewrites, mirroring the boy-scout rule (leave code a little better, in small steps) and, for anything large enough to need staged replacement, the strangler-fig pattern (build the replacement alongside the old code and cut over incrementally). Size each entry as a single unit of work someone could pick up and finish in one sitting, not "rewrite module X" or "redesign the architecture."
- **Prioritize like the debt has a cost, not just a badness score.** Industry guidance weighs debt by business impact/risk against remediation effort, favoring high-impact/low-effort items — this is why Step 3 caps the run and asks you to keep the entries most likely to cause real harm or slow down future work, not just the most numerous. The entry format in Step 4 records both halves of that trade-off: what resolving the debt buys (**Benefits**) and what resolving it costs (**Complexity**).

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

Entries appear in two shapes, and both count. Older entries are a single free-form paragraph ending in a severity rating; newer ones follow the structured format Step 4 defines, where the `*` bullet carries the entry's **Summary** and indented sub-bullets carry the rest. Read whichever you find as written — you are not migrating the old ones.

Collect every existing entry from all three sections into one list, identifying each by its Summary line (structured) or by the whole bullet (older paragraph form). This is the dedupe set: nothing you add in Step 5 may restate an item already present anywhere in the file, even worded differently. If the same underlying issue is already listed (in any section), skip it.

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

Every entry is one `*` bullet carrying its **Summary**, followed by four sub-bullets indented two spaces — **Benefits**, **Complexity**, **Proposal**, **Risks**, in that order and no other. No IDs, no severity rating, no fields beyond these five:

```
* **Summary:** <one sentence, no file names>
  * **Benefits:** <one sentence>
  * **Complexity:** <N>/10
  * **Proposal:** <the detailed plan, naming modules, files, directories, and functions>
  * **Risks:** <one sentence>
```

The Summary bullet is the entry's identity line — it is what a reader scans, and what other tasks quote when they list, defer, or resolve the item — so it has to stand on its own without the fields beneath it.

### The five fields

- **Summary.** One sentence describing the change you are proposing, readable at a glance and capturing the scope of the work. Write it as a proposal, not as a complaint: what would be done, and roughly how much of the codebase it reaches. **Name no files, directories, or functions here** — the scope belongs in words ("across the picker overlays", "in the websocket client layer"), and the paths belong in Proposal. If the sentence needs a path to make sense, it has slipped into implementation and belongs in Proposal.
- **Benefits.** One sentence naming the specific benefits resolving the debt achieves — what becomes cheaper, safer, or possible that is not today. Say what actually improves ("a dropped connection surfaces as a handled error instead of a blank pane"), not a generic virtue ("better code quality", "improved maintainability").
- **Complexity.** A score from 1 to 10 on the scale below, written as `N/10` with no other commentary.
- **Proposal.** The detailed plan. This is the only long field, and it is where the evidence lives: the symptom you observed, the design gap behind it (per Background), and the concrete modules, files, directories, and functions to change, so whoever picks the entry up does not have to rediscover what you found. Reference files by path only, never by line number — the files move, the facts don't. Multiple sentences are expected; keep it to one paragraph.
- **Risks.** One sentence naming the specific risks the proposal carries — the behavior that could regress, the callers that could be missed, the area that is under-tested. "Low risk" is not a risk; if you genuinely see none, say what would make it visible if you were wrong.

### The complexity scale

Rate the effort and reach of the **proposal**, not the badness of the debt:

| Complexity | Meaning |
|------------|---------|
| **1–3** | A localized change: one or two files, a rename, an extraction, or a helper both call sites already want. No contract changes. |
| **4–7** | A real refactor: several files, a shared abstraction introduced, or an existing contract adjusted — but the shape of the fix is clear and it can be verified step by step. |
| **8–10** | Architectural: a new contract adopted by many consumers at once, a staged replacement, or a change whose blast radius spans a subsystem. |

Size entries so they land in the 1–7 band wherever the debt allows — `ai/tasks/resolve-technical-debt.md` walks this backlog and defers anything rated 8 or higher instead of resolving it, so an 8+ entry is a note for later, not work anyone will pick up soon. Per Background, prefer a single unit of work someone could finish in one sitting over "rewrite module X"; when a large area only makes sense as one change, rate it honestly at 8+ rather than understating it.

### Worked example

```
* **Summary:** Give the websocket client one explicit failure contract for request errors and connection loss, and make its callers handle it.
  * **Benefits:** A server error or dropped socket surfaces as a handled failure the UI can report, instead of resolving as an empty success that callers dereference into blank panes.
  * **Complexity:** 6/10
  * **Proposal:** `JanusClient.request` in `web/src/ws.ts` ignores the `error` field carried on `rpc-reply`, resolves `undefined as T` when the socket is not open, and leaves every pending promise unsettled when the socket closes, so there is no failure path to handle and the type says there is nothing to check. Callers took the types at their word: `web/src/useQuickOpen.ts`, `web/src/file-navigator/useFileNavigatorSearch.ts`, and `web/src/file-navigator/useFileNavigatorMoveOperations.ts` each dereference the declared result immediately. Return a typed result (or reject) on server errors and on a closed socket, settle every pending call when the connection closes or the client is disposed, and update the three call sites plus their colocated tests to handle the failure branch.
  * **Risks:** Callers that today silently receive `undefined` will start seeing errors, so a path that appeared to work while disconnected may begin surfacing failures the UI has no state for.
```

---

## Step 5 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new entries to the end of the `## development` section only. Leave `## ready` and `## deferred` exactly as they are — do not reorder, reword, reformat, or remove anything in any section, including `## development`'s existing entries. Older paragraph-form entries stay exactly as written; the new format applies to what you add, not to what is already there.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new entry carries all five fields, in order, with the sub-bullets indented under its Summary.
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
Entries:           <one line per new entry: its Summary and complexity — or "none found">
Commit:            <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
