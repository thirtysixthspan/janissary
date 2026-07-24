# Find User Documentation Gaps

Your job: survey the application's functional areas — derived from git logs, `product/specs/`, and source code — and compare each against the user documentation to find where the docs lag behind what the app actually does. Score each candidate area 1–10 for the size of the mismatch using the evidence-based rubric in Step 4, and maintain the results in `product/backlog/user-documentation.md`. This task **researches and records** gaps; it does not fix them.

Throughout this task, "user documentation" means exactly two surfaces: `documentation/user-documentation/**/*.md` and `help.md`. A fact covered in either surface counts as documented.

This task edits **one file only**: `product/backlog/user-documentation.md`. You will never touch application source code, specs, docs pages, `help.md`, tests, or config.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, or runs the app — so it does not need the full [`prepare-workspace.md`](../prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely. If a later step's script fails for lack of dependencies, run `npm install --ignore-scripts`, then check `git status` — the install itself can rewrite `package-lock.json` (version-sync churn); if it did and you did not change dependencies, revert it with `git checkout -- package-lock.json`.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog, if it exists

Read `product/backlog/user-documentation.md` if it exists.

1. Extract the `Last run:` date from the top of the file. If the file exists but the date is missing or unparseable, treat it as 3 months ago. Call this date `SINCE` — you will substitute it literally into the git commands in Step 2.
2. List the area IDs already in the `candidates` section. Every one of them **must** be re-verified in Step 4 this run — a gap may have been closed since it was recorded, and stale entries are worse than no entries.

If the file does not exist, set `SINCE` to 3 months ago and start fresh — every functional area is a candidate.

---

## Step 2 — Derive the list of candidate areas

Build a candidate list of functional areas from three sources. Do all three — each catches gaps the others miss. At this step you are only **collecting names and signals**, not judging severity; the deep read happens in Step 4.

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
2. **Git logs.** Review history since the last run for user-facing behavior changes. The raw app-side log can run to hundreds of commits, so filter by type up front:

   ```bash
   git log --oneline --since="<SINCE>" --extended-regexp --grep='^(feat|fix)' -- src/ web/src/ product/specs/
   git log --oneline --since="<SINCE>" -- documentation/user-documentation/ help.md
   ```

   From the first list, flag subjects that sound user-facing: new commands, new flags, renames, removed behavior, changed defaults. For each flagged commit whose area does **not** appear in the second list in the same period, add that area as a candidate. If a subject is unclear, run `git show --stat <hash>` to see what it touched before deciding — do not guess from the subject line alone.
3. **Code.** Look for user-facing surface with no spec: commands registered in the command bar, key bindings, CLI flags in `bin/janus.mjs`. Grep the relevant registries in `src/` and `web/src/` — read only, never edit. Anything a user can invoke that has no spec **and** no doc page is a candidate.

Merge the three lists with the carried-over entries from Step 1 into one deduplicated list, keyed by area ID. Record next to each area *why* it is a candidate (no page / user-facing commits since `SINCE` / carried over) — you will need this in Step 4.

---

## Step 3 — Bound the run

Order the candidate list:

1. All carried-over entries from Step 1 (these must always be re-verified).
2. New candidates with no doc page at all.
3. New candidates flagged from git logs or code.

Deep-evaluate (Step 4) the carried-over entries **plus at most 10 new candidates**, in that order. If more new candidates remain, list them in the backlog file's `unverified` section (Step 5) with the signal that flagged them and **no score** — never publish a score for an area you did not evaluate. The next run picks them up.

---

## Step 4 — Evaluate and score each area

Scores must be reproducible from evidence, not impressions. For each area, follow this exact procedure:

Before reading spec bodies, check their sizes in one call (`wc -l product/specs/<a>.md product/specs/<b>.md …`) and read several specs per batch of tool calls — one round-trip per spec wastes most of the run.

1. **Enumerate the documentable facts.** Read the spec in full (if one exists) and, where the spec is silent or ambiguous, read the relevant source. List the area's user-visible facts: each command, subcommand, flag, key binding, and each distinct behavior a user would need to know (defaults, limits, error conditions they'll hit). Count them — call this **N**. For a typical area N lands between 5 and 20; if you counted fewer than 3, you read too shallowly — go back.

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
   | All facts correct; only wording/formatting drift | 1–2 |

   Within a two-point band, pick the higher number when the affected facts are ones a typical user hits (core commands, defaults), the lower when they're edge cases. Never score outside the band the evidence puts you in.
4. **Write the gap description.** One single paragraph of at most 10 sentences per area. It must be detailed enough that a human or an AI can eliminate the gap immediately, without redoing the research: state the fact counts (`4 of 11 facts missing, 1 wrong`), name the most important missing or wrong facts concretely (the flag, the subcommand, the changed default, the verbatim command syntax), say where the fix belongs (edit the existing page, add a new page, fix the `help.md` row), and name every relevant existing file by path — the spec, the doc page(s) or their absence, and the source file(s) that hold the ground truth. Reference files only, never specific lines: no line numbers, no "see line 42", no quoted excerpts located by position — the files move under their references, the facts don't.

Rules that keep scores honest:

- If the spec and the app disagree, the **app** is the ground truth for facts; note the stale spec in the gap description but do not edit it.
- If you could not verify a fact (source too tangled to read confidently), leave it out of N rather than guessing its status.
- Areas scoring 1–2 are not gaps: leave them out of the candidate table. If a previous run listed one, remove it and record it under `Resolved since last run`.
- A carried-over entry keeps its area ID but gets a **fresh** score from this run's evidence — never copy last run's score forward.

---

## Step 5 — Integrate findings into the backlog file

Get the current timestamp — do not write one from memory:

```bash
date -u "+%Y-%m-%d %H:%M UTC"
```

Write the results to `product/backlog/user-documentation.md`. If the file already exists, **integrate** — update scores, evidence, and descriptions for areas you re-verified, remove areas whose gaps are now closed, add newly found areas. Never duplicate an area ID.

Format the file like the other `product/backlog/` files: lowercase headings, flat `*` bullet lists, one entry per bullet — no tables. Required shape:

```markdown
# user documentation gaps

Last run: <output of the date command above>

Functional areas where user documentation lags application behavior, scored 1–10 for the size of the mismatch (10 = completely undocumented).

## candidates

* ssh-tab (9/10) — SSH tabs have no page under `documentation/user-documentation/` and only a terse `help.md` row. 8 of 8 facts are undocumented, including the `ssh <host>` command syntax, the reconnect behavior, and the tab-close semantics. The ground truth is `product/specs/ssh-tab.md` and `src/ssh-tab.ts`. Fix by adding a new page under `documentation/user-documentation/tab-types/` and verifying the `help.md` one-liner still matches.

* monitoring (6/10) — <same shape: fact counts, the specific missing/wrong facts, ground-truth files, where the fix belongs>

## unverified

* <area-id> — flagged by <signal>; not yet evaluated (over this run's limit)

## resolved

* <area-id> — <one line on why it no longer qualifies> (removed <YYYY-MM-DD>)
```

Keep `candidates` sorted by score, highest first; break ties alphabetically by area ID. Each candidate bullet is exactly one paragraph, at most 10 sentences, written per Step 4 point 4. Update `Last run` on every run, even if nothing else changed. `resolved` holds only entries removed in *this* run — delete last run's entries from it. Leave `unverified` and `resolved` present but empty when they have no entries, matching how the other backlog files keep their empty sections.

Before moving on, verify:

1. `git status` shows `product/backlog/user-documentation.md` as the **only** changed file. If anything else changed, revert it (`git checkout -- <file>`) before committing.
2. Re-read the file once: entries sorted by score, no duplicate area IDs, every candidate bullet is a single paragraph with fact counts and file paths but no line numbers, timestamp is this run's.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `docs` type subject, e.g.:

```
docs(backlog): refresh user-documentation gap candidates
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Areas evaluated:  <count> (<carried over> re-verified, <new> new)
Gaps recorded:    <count> (top: <highest-scoring area> — <score>)
Unverified:       <count deferred to next run>
Resolved:         <count removed this run>
Backlog file:     product/backlog/user-documentation.md
Commit:           <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
