# Find User Documentation Gaps

Your job: survey **all** of the application's functional areas — derived from the complete available git history, every file in `product/specs/`, and source code — and compare each against the user documentation to find where the docs lag behind what the app actually does. Do not impose a date window, area cap, or backlog-item cap. Score every candidate area 1–10 using the evidence-based rubric in Step 4. Add **only actionable documentation gaps** (scores 3–10) to the active `ready` and `development` sections of `product/backlog/documentation.md`, the shared documentation work queue that [`update-documentation.md`](../update-documentation.md) draws from. Areas scoring 1–2 have no documentation change to request and must not be added to those active sections; existing `resolved` history stays untouched. This task **researches and records** gaps; it does not fix them. Print every area reviewed and its outcome in the final report, including areas with no qualifying gap and areas determined to be internal-only.

Throughout this task, "user documentation" means exactly two surfaces: `documentation/user-documentation/**/*.md` and `help.md`. A fact covered in either surface counts as documented.

This task edits **one file only**: `product/backlog/documentation.md`. You will never touch application source code, specs, docs pages, `help.md`, tests, or config. That file is shared with other producers of documentation work — human-typed requests and other tasks may also add bullets to it — so only ever add, update, or remove the bullets this task itself owns (tracked by area ID); never touch bullets you did not write.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process. A candidate inventory is not an evaluation: a run is incomplete until every candidate has a Step 4 fact comparison or an internal-only determination, every completed area has a Step 3 progress line, and the final inventory has exactly one outcome per candidate. Do not commit, push, or report completion while any candidate is unevaluated.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, or runs the app — so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely. If a later step's script fails for lack of dependencies, run `npm install --ignore-scripts`, then check `git status` — the install itself can rewrite `package-lock.json` (version-sync churn); if it did and you did not change dependencies, revert it with `git checkout -- package-lock.json`.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see AGENTS.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog, if it exists

Read `product/backlog/documentation.md` if it exists. This file carries the sections `ready`, `development`, `deferred`, and `resolved`, the same shape as the other `product/backlog/` files, and other tasks or humans may add bullets to any of them alongside this task's own.

1. Scan the complete repository history available from the checked-out branch.
2. Of the bullets already in `ready` and `development`, identify which ones this task authored in a prior run — they carry a `(<score>/10)` after the area ID, e.g. `* ssh-tab (9/10) — ...` (bullets from other sources won't have this shape; leave those alone throughout this task). Every one of your own area IDs **must** be re-verified in Step 4 this run — a gap may have been closed since it was recorded, and stale entries are worse than no entries. `ready` is reserved for carried-over actionable gaps; new actionable gaps scoring 3–10 belong in `development`.

If the file does not exist, start fresh — every functional area is a candidate. (In that case create the file with the standard four empty sections before Step 5.)

---

## Step 2 — Derive the list of candidate areas

Build a candidate list of functional areas from three sources. Do all three — each catches gaps the others miss. Every spec is a candidate on every run, even if prior documentation work marked it resolved; re-verify its current coverage. At this step you are only **collecting names and signals**, not judging severity; the deep read happens in Step 4.

**Area IDs.** Identify every area by a stable ID so entries dedupe across runs: the spec filename without `.md` (e.g. `product/specs/quick-open.md` → `quick-open`). For an area with no spec, invent a short kebab-case ID and keep using it in later runs.

1. **Specs.** Run `ls product/specs/` — every spec file is a functional area. For each, check for a matching doc page:

   ```bash
   find documentation/user-documentation -iname '*<keyword>*'
   ```

   Try the obvious keyword and one synonym (e.g. `db` and `database`; `msg` and `message`). **A missing filename is a hint, not proof**: coverage often lives inside a page with an unrelated name (command comments are documented in `commands.md`; the CLI in `startup.md`). When the filename check comes up empty, also grep the docs *content* for the area's command name and key chord before treating it as uncovered:

   ```bash
   grep -riln '<command or key chord>' documentation/user-documentation/
   ```

   Grep one specific token per call (a command word, `Cmd+P`, a flag) — a single alternation of many loose terms matches half the site and tells you nothing. Also grep `help.md` for the area's command name. A spec with no doc page, no content mention, **and** no `help.md` row is an automatic candidate.

2. **Git logs.** Review the full available history for user-facing behavior changes. The raw app-side log can run to hundreds of commits, so filter by type up front, but do not filter by date:

   ```bash
   git log --oneline --extended-regexp --grep='^(feat|fix)' -- src/ web/src/ product/specs/
   git log --oneline -- documentation/user-documentation/ help.md
   ```

   From the first list, flag subjects that sound user-facing: new commands, new flags, renames, removed behavior, changed defaults. Compare history chronologically per area: a documentation change only covers behavior changes that landed before it, so a later user-facing change for the same area is still a candidate unless a subsequent doc change covers it. If the commit-to-area or doc-to-change relationship is unclear, inspect the commit with `git show --stat <hash>` and include the area as a candidate rather than assuming it is covered.
3. **Code.** Look for user-facing surface with no spec: commands registered in the command bar, key bindings, CLI flags in `bin/janus.mjs`. Grep the relevant registries in `src/` and `web/src/` — read only, never edit. Anything a user can invoke that has no spec **and** no doc page is a candidate.

Merge the three lists with the carried-over entries from Step 1 into one deduplicated list, keyed by area ID. Record next to each area *why* it is a candidate (spec area / no page / user-facing history / user-invocable code / carried over) — you will need this in Step 4 and in the review inventory printed in Step 7. Do not omit an area because it was previously resolved or because a recent change was not found. List and count the final area inventory before beginning Step 4. Record the expected count; Step 5 and Step 7 must reconcile against this exact inventory, not against a memory-based sample.

---

## Step 3 — Review the complete candidate list

Order the complete candidate list:

1. All carried-over entries from Step 1 that are already in `ready` (these must always be re-verified).
2. New candidates with no doc page at all.
3. All remaining spec areas and candidates flagged from code, ordered by area ID.

Deep-evaluate **every** area in the candidate list in that order. There is no evaluation limit and no candidate may be deferred for a later run because of the list's size. An inventory scan, a filename match, an old `resolved` note, or a docs commit in the history does not count as a current evaluation; compare current shipped behavior and current documentation for each area.

Before Step 4, create an audit ledger in your working notes with one row per candidate and these fields: area ID, candidate reason, documentable fact count N, correct/missing/wrong counts, score or internal-only, and the evidence file paths. Fill a row only after its Step 4 comparison or internal-only determination is complete. Record a progress line as each row is completed, naming its area ID and outcome. Do not move to the next area until the current ledger row and progress line are complete.

Record every actionable user-facing gap scoring 3–10 in `development` unless it is a carried-over `ready` item; do not cap the number of gap entries. Do **not** add a new or carried-over score-1–2 no-gap area to `ready` or `development`; report it in the final inventory only, and resolve a carried-over item under Step 5. An area with no user-visible behavior is classified as internal-only, not scored, and not added to the backlog. Never add a new candidate to `ready`.

---

## Step 4 — Evaluate and score each area

Scores must be reproducible from evidence, not impressions. For each area, follow this exact procedure:

Before reading spec bodies, check their sizes in one call (`wc -l product/specs/<a>.md product/specs/<b>.md …`) and read several specs per batch of tool calls — one round-trip per spec wastes most of the run.

1. **Enumerate the documentable facts.** Read the spec in full (if one exists) and, where the spec is silent or ambiguous, read the relevant source. First determine whether the area has user-visible behavior at all. If it is only contributor workflow, protocol internals, or maintenance tooling, record it as internal-only and continue to the next area; do not score it as a documentation gap. Otherwise, list the area's user-visible facts: each command, subcommand, flag, key binding, and each distinct behavior a user would need to know (defaults, limits, error conditions they'll hit). Count them — call this **N**. For a typical area N lands between 5 and 20; if you counted fewer than 3, you read too shallowly — go back.

   Specs go stale: before a command, subcommand, or flag from the spec goes into your fact list or a gap description, confirm it exists — a `help.md` row or one `grep -rln '<token>' src/` is enough. Where they disagree, the app is the ground truth (e.g. a spec saying `monitor stop` when the shipped command is `unmonitor`); use the app's name and note the stale spec in the gap description.
2. **Check each fact against the docs.** If Step 2's content greps already confirmed the area has **zero** doc coverage (no page, no content mention, at most a terse `help.md` row), skip the side-by-side comparison: every fact is missing by definition, the score comes from the top two rubric rows, and your fact list is only needed to write the gap description. Otherwise, read the matching doc page(s) and `help.md` rows side by side with your fact list. Mark every fact one of: **correct** (documented and accurate), **missing** (not documented anywhere), or **wrong** (documented but no longer matches the app — verify against source or the spec's verbatim text before marking wrong, since a wrong fact actively misleads and weighs heaviest).
3. **Score from the table.** Compute the missing fraction (missing ÷ N) and count the wrong facts, then take the score from the first row that matches:

   | Condition | Score |
   |-----------|-------|
   | No doc page and no `help.md` coverage at all | 10 |
   | No doc page; only a terse `help.md` row exists | 9 |
   | ≥ 2 wrong facts, or 1 wrong fact on the area's core workflow | 7–8 |
   | > 50% of facts missing | 7–8 |
   | 25–50% missing, or exactly 1 wrong fact (non-core) | 5–6 |
   | < 25% missing, none wrong | 3–4 |
   | All facts correct; no user-serving correction is needed (including merely cosmetic wording or formatting drift) | 1–2 |

   Within a two-point band, pick the higher number when the affected facts are ones a typical user hits (core commands, defaults), the lower when they're edge cases. Never score outside the band the evidence puts you in.
4. **Write the gap description.** One single paragraph of at most 10 sentences per area. It must be detailed enough that a human or an AI can eliminate the gap immediately, without redoing the research: state the fact counts (`4 of 11 facts missing, 1 wrong`), name the most important missing or wrong facts concretely (the flag, the subcommand, the changed default, the verbatim command syntax), say where the fix belongs (edit the existing page, add a new page, fix the `help.md` row), and name every relevant existing file by path — the spec, the doc page(s) or their absence, and the source file(s) that hold the ground truth. Reference files only, never specific lines: no line numbers, no "see line 42", no quoted excerpts located by position — the files move under their references, the facts don't.

Rules that keep scores honest:

- If the spec and the app disagree, the **app** is the ground truth for facts; note the stale spec in the gap description but do not edit it.
- If you could not verify a fact (source too tangled to read confidently), leave it out of N rather than guessing its status.
- Areas scoring 1–2 are not backlog items: do not add them to `ready` or `development`. If a carried-over task-owned item scores 1–2, remove it from the active section and record its closure under `resolved` in Step 5. A newly discovered area scoring 1–2 appears only in the Step 7 inventory.
- A carried-over entry keeps its area ID but gets a **fresh** score from this run's evidence — never copy last run's score forward.

---

## Step 5 — Integrate findings into the backlog file

Write the actionable gaps to `product/backlog/documentation.md`. If the file already exists, **integrate** — update scores and descriptions for carried-over areas you re-verified, remove carried-over areas whose gaps are now closed, and add or update only new user-facing areas scoring 3–10 in `development` — touching only bullets this task owns (see Step 1 point 2). No-gap areas scoring 1–2 and internal-only areas never go into the active backlog. Never duplicate an area ID. Do not move a new candidate into `ready`; only existing carried-over `ready` entries may remain there or be updated.

Format the file like the other `product/backlog/` files: lowercase headings, flat `*` bullet lists, one entry per bullet — no tables, no timestamp anywhere in the file. Required shape:

```markdown
# documentation

## ready

* ssh-tab (9/10) — SSH tabs have no page under `documentation/user-documentation/` and only a terse `help.md` row. 8 of 8 facts are undocumented, including the `ssh <host>` command syntax, the reconnect behavior, and the tab-close semantics. The ground truth is `product/specs/ssh-tab.md` and `src/ssh-tab.ts`. Fix by adding a new page under `documentation/user-documentation/tab-types/` and verifying the `help.md` one-liner still matches.

* monitoring (6/10) — <same shape: fact counts, the specific missing/wrong facts, ground-truth files, where the fix belongs>

## development

* <new-gap-id> (6/10) — <actionable gap scoring 3–10: fact counts, specific missing/wrong facts, ground-truth files, and where the fix belongs>

## deferred

## resolved

* <area-id> — <one line on why it no longer qualifies> (removed <YYYY-MM-DD>)
```

Within `ready`, keep this task's own carried-over bullets sorted by score, highest first (break ties alphabetically by area ID), grouped ahead of or behind other tasks'/humans' unscored bullets — whichever ordering keeps your own entries contiguous and easiest to re-verify next run; never reorder or reword a bullet you did not author. Keep evaluated gap entries in `development` unless they are carried-over `ready` items. Each scored bullet is exactly one paragraph, at most 10 sentences, written per Step 4 point 4. `resolved` accumulates across runs — add this run's closures, don't delete earlier ones (including ones added by other tasks). Get removal dates from `date -u "+%Y-%m-%d"` — do not write one from memory.

Before moving on, verify:

1. `git status` shows `product/backlog/documentation.md` as the **only** changed file. If anything else changed, revert it (`git checkout -- <file>`) before committing.
2. Re-read the file once: your carried-over entries in `ready` are sorted by score, all new gap candidates are in `development`, no area ID is duplicated among your own active entries, every scored candidate bullet is a single paragraph with fact counts and file paths but no line numbers, and no bullet you don't own was altered.
3. Confirm the final review inventory has exactly one outcome for every candidate area from Step 2, and its count matches the recorded expected count. Every score-3–10 user-facing gap must appear once in the task-owned active backlog entries; no score-1–2 area or internal-only area may appear in those entries. Do not report an area as reviewed unless Step 4's fact-by-fact comparison or internal-only determination was completed for it.

**Completion gate:** if the inventory count does not match, any candidate lacks its fact statuses and score (or internal-only determination), any progress line is missing, or a task-owned active backlog entry has no actionable gap, do not proceed to Step 6. Continue the audit and reconciliation until all checks pass. A long inventory is not a reason to shorten or omit the work.

The ledger is the completion proof. Do not substitute the number of backlog bullets for the candidate count: no-gap and internal-only areas still require completed ledger rows and final-report outcomes, but they do not become backlog items.

---

## Step 6 — Commit and push

If Step 5 changed `product/backlog/documentation.md`, execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use exactly this commit subject for consistent identification of these research runs:

```
docs(backlog): refresh documentation gap candidates
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

If Step 5 made no backlog changes because there were no actionable gaps or carried-over items to close, do not create an empty commit. Leave the clean working tree unchanged and report `Commit: none (no backlog changes)`.

---

## Step 7 — Report

Give the user a report in this shape. The `Areas reviewed` section must enumerate every area ID from Step 2, with its score and gap/backlog outcome or a concise reason it has no user-documentation gap. An internal-only area is marked `not scored; internal-only`. Never collapse the inventory to a count or a sample.

```
Areas evaluated:  <count> (<carried over> re-verified, <new> new)
Gaps recorded:    <count of actionable score-3–10 gaps> (top: <highest-scoring area> — <score>)
Deferred to next: <count deferred to next run>
Resolved:         <count removed this run>
Backlog file:     product/backlog/documentation.md
Commit:           <short-sha> pushed to master | push failed (see above) | none (no backlog changes)

Areas reviewed:
* <area-id> — <score>/10; <gap recorded | no qualifying gap>
* <area-id> — not scored; internal-only
* ... one bullet for every area evaluated ...
```

The area inventory is required even when it is long; do not truncate it to keep the report brief. Done.
