# Find Product Gaps

Your job: compare this application's current feature set — as described in `product/specs/` — against similar products in its category, using extensive external research, to spot incomplete or missing features. Log what you find as new entries under the `## development` section of `product/backlog/features.md`. This task **researches and records** gaps; it does not build them, and other tasks (`build-a-feature.md`, `plan-ready-features.md`) own turning what lands here into shipped work.

**Never run repository build/lint/test tooling.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check`, `./scripts/run.mjs check-diff`, or any other build/lint/test/analysis tooling. Plain read-only shell commands used only to navigate (`ls`, `wc -l`, `grep`, `git log`) are fine — the restriction is on running the project's build/lint/test/quality machinery, not on looking at files.

This task edits **one file only**: `product/backlog/features.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — how to reason about product gaps

- **A gap is a missing or incomplete capability, not a bug or a refactor.** This task is not `find-technical-debt.md` — it does not care about code quality, only about what a user of this application can and cannot *do* compared to what users of comparable products can do. If a feature exists but is half-finished (e.g. a spec describes a command with no undo, no cancellation, no error feedback), that counts as a gap too.
- **Grounding matters more than volume.** A gap entry is only useful if it names a concrete comparable product and the concrete capability that product has and this one lacks (or has only partially). "Add better search" is not a gap entry. "Add fuzzy history search across all tabs, the way iTerm2's shell-integration search does, so a user can jump back to a command run in a different tab" is.
- **Prefer gaps adjacent to what already exists.** This application already has a point of view (multi-harness tabs, workspaced agents, monitoring, scheduling, profiles — see `product/specs/`). Favor gaps that extend an existing area over gaps that would require an entirely new subsystem; those speculative, larger ideas still belong in the backlog but are lower priority (see Step 3).
- **The backlog already contains prior art.** `product/backlog/features.md` has existing entries from earlier rounds of exactly this kind of competitive research (e.g. "Adjacent-tool feature mining", "Feature gap matrix"). Read them before researching so you don't duplicate work already captured.

---

## Step 0 — Prepare the workspace

This task only reads files, searches the web, and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/features.md`. It has three sections — `## ready`, `## development`, `## deferred` — each a bullet list with no IDs or scores.

Collect every existing bullet from all three sections into one list. This is the dedupe set: nothing you add in Step 5 may restate an item already present anywhere in the file, even worded differently. If the same underlying gap is already listed (in any section), skip it.

---

## Step 2 — Understand the current application

Read every file in `product/specs/` (`ls product/specs/` first to see the full list) to build an accurate picture of what this application currently does: tab types, commands, harness integration, monitoring, scheduling, profiles, connections, and so on. This is your baseline — you need to know precisely what already exists before you can tell what's missing.

Also skim `product/backlog/features.md`'s `## ready` and `## deferred` sections (already loaded in Step 1) so you don't re-propose something already planned or intentionally shelved.

---

## Step 3 — Research comparable products

Identify this application's category from the specs you just read: a terminal-based, multi-harness AI coding agent workspace (tabs, harness sessions, monitoring/scheduling of agents, workspaces). Using `WebSearch`, research products that compete in or border this category, for example (do not treat this as exhaustive — follow what the specs actually suggest, and follow up on what search results surface):

- Other AI coding agent CLIs/TUIs and their surrounding tooling (e.g. terminal multiplexers with agent integration, IDE agent panels, agent orchestration frameworks).
- Terminal emulators and multiplexers with power-user features (tmux, iTerm2, Warp, Zellij) for tab/session/search/history capabilities that might translate.
- Agent-orchestration and workflow tools (e.g. multi-agent frameworks, workflow/automation builders) for scheduling, monitoring, and multi-agent coordination patterns.
- SSH/remote-session managers for connection-handling capabilities.

For each product you research, note the specific feature(s) relevant to this application's domain, not the product's entire feature set. Run multiple distinct searches — one broad ("AI coding agent terminal tools comparison"), then targeted follow-ups per capability area (e.g. "tmux session search", "agent orchestration monitoring dashboard") — a single search will not surface enough breadth. Read enough of each result to confirm the feature is real and how it works, not just the search snippet.

For every candidate gap, note: the comparable product, the specific feature it has, and what this application currently does instead (nothing, or a partial version) — you need this to write a concrete entry in Step 5.

---

## Step 4 — Bound the run

Cap this run at **10 new entries**. If you find more genuine candidates than that, keep the 10 you judge most valuable (closest fit to this application's existing point of view, most concretely specified, most likely to be genuinely missing rather than a matter of taste) and leave the rest for the next run — do not pad the list with vague or speculative entries just to hit the cap, and do not exceed it.

If you find zero genuine candidates after a good-faith search, that is a valid outcome — do not invent gaps that aren't there.

---

## Step 5 — Write each entry

Match the existing style in `product/backlog/features.md`'s `## development` section: free-form prose bullets describing the idea and its rationale (see the existing entries for tone, e.g. "Adjacent-tool feature mining" or "Feature gap matrix").

Each new bullet must:

- Name the concrete comparable product and the feature it has.
- Describe what this application currently does instead (missing entirely, or only partially — name the relevant `product/specs/*.md` file(s) if the area already partially exists).
- Describe, in a sentence or two, what adopting or adapting the idea would look like here — stay high-level; this is a backlog entry, not a design.
- Stay to one paragraph.
- Estimate the complexity of the feature.

---

## Step 6 — Integrate into the `## development` section

Open `product/backlog/features.md` and add your new bullets to the end of the `## development` section only. Leave `## ready` and `## deferred` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/features.md` as the **only** changed file.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 7 — Commit and push

Execute [`quick-commit.md`](quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log new product gap findings
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Existing entries:  <count found in Step 1, across all sections>
Products researched: <count of distinct comparable products consulted>
New entries added: <count> (to product/backlog/features.md, ## development)
Entries:           <one line per new entry, or "none found">
Commit:            <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
