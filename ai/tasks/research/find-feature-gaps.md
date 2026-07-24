# Find Feature Gaps

Your job: take each of Janissary's existing feature areas — as described in `product/specs/` — and compare its *current implementation* against the equivalent, mature feature in whatever comparable product owns that specific piece of UX, using extensive external research, to spot where an existing feature is shallower or less complete than the standard elsewhere. For example, compare the editor tab (`product/specs/editor-tab.md`) against a full IDE's editor pane (VS Code, JetBrains) — not "does Janissary have an editor" but "what does VS Code's editor do that Janissary's editor tab doesn't." Log what you find as new entries under the `## development` section of `product/backlog/features.md`. This task **researches and records** gaps; it does not build them, and other tasks (`build-a-feature.md`, `plan-ready-features.md`) own turning what lands here into shipped work.

This task is the depth-focused sibling of [`find-feature-ideas.md`](find-feature-ideas.md): that task looks for entirely new capabilities or subsystems inspired by adjacent tools; this task instead drills into features Janissary **already has** and checks whether their current implementation holds up against the feature's own category leader. Read `find-feature-ideas.md`'s output style for contrast before starting, so the two tasks stay complementary rather than duplicating each other.

**Never run repository build/lint/test tooling.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check`, `./scripts/run.mjs check-diff`, or any other build/lint/test/analysis tooling. Plain read-only shell commands used only to navigate (`ls`, `wc -l`, `grep`, `git log`) are fine — the restriction is on running the project's build/lint/test/quality machinery, not on looking at files.

This task edits **one file only**: `product/backlog/features.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — how to reason about implementation gaps

- **A gap here is a shortfall in depth, not a missing subsystem.** Every entry must name a feature area Janissary *already has* (a tab type, a command, a panel) and the specific thing its own natural category-leader does that Janissary's version doesn't — not a capability Janissary lacks entirely (that belongs in `find-feature-ideas.md`). "Our editor tab has no multi-cursor editing, which every mainstream IDE editor (VS Code, JetBrains, Sublime) treats as table stakes" is this task's shape; "add a whole new kanban board" is not.
- **Match each feature to its own point of comparison, not a generic competitor.** Janissary's feature areas span very different domains, so the comparable product differs per area: the editor tab's natural comparison is an IDE's editor pane (VS Code, JetBrains, Sublime, Zed), the file navigator tab's is an IDE's project explorer or a file manager (VS Code Explorer, Finder, a TUI file manager), the markdown tab's is a dedicated Markdown viewer/editor (Obsidian, Typora, GitHub's own renderer), the database section's is a DB client (DBeaver, TablePlus, DataGrip), the browser command's is browser automation tooling (Playwright's own Inspector/Trace Viewer, Puppeteer), the ssh tab's is a connection manager (Termius, Royal TSX, PuTTY), the scheduling section's is a scheduling UI (cron GUIs, GitHub Actions' schedule syntax, OS task schedulers), and so on. Pick the comparison that actually owns that UX, not whatever AI-coding-tool happens to be top of mind.
- **Grounding matters more than volume.** A gap entry is only useful if it names the Janissary feature area (its spec file), the concrete comparable product, and the specific capability that product's version of the same feature has that Janissary's lacks or does more shallowly. "Editor tab needs more IDE features" is not a gap entry. "The editor tab (`product/specs/editor-tab.md`) has no go-to-definition or symbol search, the way VS Code's editor jumps to a function's declaration or lists every symbol in a file via its language server" is.
- **Prefer gaps in high-usage areas.** Favor feature areas a user spends the most time in — the editor tab, the file navigator, the transcript/terminal, the command line — over rarely-touched corners, since depth gaps there compound the most. Depth gaps in lower-traffic areas (image tab zoom controls, quit-confirmation dialog) still count but are lower priority.
- **The backlog already contains prior art.** `product/backlog/features.md` has existing entries from earlier rounds of competitive research, including from `find-feature-ideas.md`'s broader new-capability sweeps. Read them before researching so you don't duplicate work already captured under a different framing.

---

## Step 0 — Prepare the workspace

This task only reads files, searches the web, and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../prepare-workspace.md) install. Do this instead:

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

## Step 2 — Inventory Janissary's feature areas and their natural comparisons

Read every file in `product/specs/` (`ls product/specs/` first to see the full list). For each spec, note two things: what the feature actually does today, and what kind of feature it is — which determines what it should be measured against in Step 3. Group specs by the category-leader they map to, for example:

- **Editor-like**: `editor-tab.md` → IDE editors (VS Code, JetBrains, Sublime, Zed).
- **File-browsing**: `file-navigator-tab.md` → IDE project explorers / file managers.
- **Terminal/multiplexer-like**: `tabs.md`, `history.md`, `keyboard-navigation.md`, `shell.md` → tmux, iTerm2, Warp, Zellij.
- **Document viewers**: `markdown-tab.md`, `markdown-rendering.md`, `image-tab.md` → Obsidian, Typora, GitHub's renderer, an OS image viewer.
- **Database tooling**: `database.md`, `connection.md` → DBeaver, TablePlus, DataGrip.
- **Browser automation**: `browser.md`, `embedded-web-page.md` → Playwright Inspector/Trace Viewer, Puppeteer, browser devtools.
- **Remote sessions**: `ssh-tab.md` → Termius, Royal TSX, PuTTY.
- **Scheduling/automation**: `scheduling.md`, `agent-command-queue.md` → cron GUIs, GitHub Actions schedules, OS task schedulers.
- **Agent orchestration**: `harness.md`, `agents.md`, `monitoring.md`, `profiles.md`, `messaging.md` → other AI coding agent CLIs/IDEs, multi-agent frameworks, observability tooling.

This grouping is a starting point, not a fixed taxonomy — some specs may not fit cleanly, or may map to more than one comparison; use judgment.

Also skim `product/backlog/features.md`'s `## ready` and `## deferred` sections (already loaded in Step 1) so you don't re-propose something already planned or intentionally shelved.

---

## Step 3 — Research each feature area's category-leader

For a representative spread of the groupings from Step 2 — do not limit yourself to just one or two — use `WebSearch` to research the specific, mature feature set of that area's natural comparison product(s). Run one search per feature area (not one search for the whole app), for example: "VS Code editor features multi-cursor go-to-definition", "IDE project explorer features", "DBeaver features SQL client", "Obsidian markdown editor features", "Playwright Inspector trace viewer features", "Termius SSH client features", "cron GUI scheduling tools features". Read enough of each result to confirm the feature is real and how it works, not just the search snippet — a gap entry citing a feature that doesn't actually exist in the comparable product is worse than no entry.

For every candidate gap, note: the Janissary feature area (its spec file), the comparable product, the specific capability that product has, and exactly what Janissary's current implementation does instead (nothing, or a shallower version — quote or paraphrase the relevant part of the spec) — you need this to write a concrete entry in Step 5.

---

## Step 4 — Bound the run

Cap this run at **10 new entries**. If you find more genuine candidates than that, keep the 10 you judge most valuable (highest-usage area, most concretely specified, most likely to be a genuine depth gap rather than a matter of taste) and leave the rest for the next run — do not pad the list with vague or speculative entries just to hit the cap, and do not exceed it. Spread entries across more than one feature area where possible, rather than filling the cap from a single spec.

If you find zero genuine candidates after a good-faith search, that is a valid outcome — do not invent gaps that aren't there.

---

## Step 5 — Write each entry

Match the existing style in `product/backlog/features.md`'s `## development` section: free-form prose bullets describing the idea and its rationale.

Each new bullet must:

- Name the Janissary feature area (its `product/specs/*.md` file) and the concrete comparable product it's being measured against.
- State specifically what the comparable product's implementation of that same kind of feature includes that Janissary's current implementation lacks or does more shallowly.
- Describe, in a sentence or two, what closing the gap would look like here — stay high-level; this is a backlog entry, not a design.
- Stay to one paragraph.
- Estimate the complexity of closing the gap.

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

Execute [`quick-commit.md`](../quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log new feature implementation gaps
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Existing entries:    <count found in Step 1, across all sections>
Feature areas compared: <count of distinct Janissary feature areas examined>
New entries added:   <count> (to product/backlog/features.md, ## development)
Entries:             <one line per new entry, or "none found">
Commit:              <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
