# Generate Architecture Diagram

Your job: read the current shape of this codebase and produce one self-contained HTML architecture diagram summarizing it, using the vendored [`diagram-design`](../../../skills/diagram-design/SKILL.md) skill to render it. This task **researches and draws**. It never edits application source, specs, or backlog files — it only reads the codebase and writes one diagram file.

This task edits **one file only**: `documentation/diagrams/architecture.html`. Every run regenerates that file in place — it is a snapshot of the architecture as read *today*, not an append-only history. If the file does not exist yet, this run creates it.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step, including the diagram skill's own confirmation prompts (SKILL.md §3 "Confirm before drawing" and the onboarding style-guide gate in §0) — this task's Step 2 and Step 3 below tell you exactly what to choose in place of asking.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: Step 6's commit stages everything with `git add -A`, so any stray file would be silently swept in. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Read the codebase's own account of its architecture

Before reading source, read what the project already says about its own shape — this is the fastest, most authoritative map, and it keeps the diagram from re-deriving something already documented (and possibly getting it wrong):

1. [`ai/guidelines/architecture-principles.md`](../../guidelines/architecture-principles.md) — the numbered principles describing the server/client split, the manager-per-resource model, the controller's role, the command registry, the shared wire contract, and where the pressure points currently sit. Each principle names real files and directories; treat these as the skeleton.
2. `CLAUDE.md`'s "Project structure" section — the top-level directory map (`src/`, `src/plugins/`, `web/src/`, `web/src/plugins/`, `bin/`, `product/`, `ai/`, `documentation/`, `scripts/`, `profiles/`, `skills/`, `security/`, `fta/`, `temp/`).
3. Skim `product/specs/` filenames (do not read every spec) to see which subsystems have a documented functional contract — this tells you what the diagram should treat as a distinct, named component rather than an implementation detail worth collapsing.

Then confirm the guidance still matches the tree, since `architecture-principles.md` describes file sizes and structures that shift over time:

```bash
ls src/
ls src/plugins/
ls web/src/
ls web/src/plugins/
wc -l src/controller.ts
```

Note anywhere the guideline's account and the current tree disagree (a file it names no longer exists, a new top-level directory it doesn't mention, sizes that have moved). Diagram what you observe on disk; if a disagreement is material, mention it in Step 7's report rather than silently picking one source over the other.

---

## Step 2 — Build the component model

From Step 1, assemble the model the diagram will render — do this as notes, not as diagram markup yet:

- **Components.** The server (`src/`), the web client (`web/src/`), the shared wire contract (`src/protocol.ts` / `@shared/protocol`), the plugin host (`src/plugins/`) and its client counterpart (`web/src/plugins/`), the CLI entry (`bin/janus.mjs`), and the manager registry (`Managers` and its constituent managers — `TabManager`, `PseudoterminalManager`, `AcpManager`, `ScheduleManager`, `ConnectionManager`, `ConversationsManager`, and the rest named in `architecture-principles.md` principle 2). Only include a manager as its own node if it is load-bearing enough to matter at this altitude — the point is the system's shape, not an inventory of every file.
- **Connections.** The one WebSocket between server and client; the command dispatch path (`Controller` → `CommandManager` → `src/commands/*.ts` → the `Managers` registry, per principle 3 and 5); the parse/execute seam (principle 4); the shared protocol import both sides draw from (principle 7). Only draw a connection that carries real information — per the diagram-design philosophy (SKILL.md §1), a connection obvious from layout is not worth a line.
- **What to leave out.** Individual files below the component level, test files, and anything principle-level guidance calls a "shadow system" or deleted pattern (nothing that no longer exists should appear). Target the density the skill itself asks for — SKILL.md §1's "4/10, above 9 nodes it's probably two diagrams" — so pick the dozen or so nodes that carry the most signal about how this system is actually shaped, not an exhaustive module list.

This model is what Step 4 draws. If, during this step, you judge that a dependency graph or UML class diagram would communicate the codebase's shape better than a component architecture diagram (for example, if the most interesting story that run is really about the command-registry's dependency fan-out rather than the client/server split), you may choose that type instead — see Step 3.

---

## Step 3 — Load the diagram-design skill and choose the type

Invoke the `diagram-design` skill (`skills/diagram-design/SKILL.md`, vendored from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), MIT-licensed — see `skills/diagram-design/LICENSE` and `THIRD_PARTY_LICENSES.md`) via the Skill tool.

Fixed choices for this task — do not ask, do not pause, do not deviate:

- **Visual type:** [`references/type-architecture.md`](../../../skills/diagram-design/references/type-architecture.md) is the default choice for "components + connections in a system," matching this run's model from Step 2. Use [`references/type-dependency.md`](../../../skills/diagram-design/references/type-dependency.md) instead only if Step 2 concluded a dependency graph tells the more useful story this run, or [`references/type-uml-class.md`](../../../skills/diagram-design/references/type-uml-class.md) if the run is specifically about a class hierarchy. Load the chosen type reference before drawing, per SKILL.md §3.
- **Style-guide gate (SKILL.md §0):** this task's explicit, standing choice is the shipped default style guide. Never trigger `references/onboarding.md`, never fetch a URL for brand tokens, never write a profile. If `references/style-guide.md` still carries the shipped tokens, that satisfies the gate as-is — proceed.
- **Confirm-before-drawing (SKILL.md §3):** skip the pause. This document *is* the confirmation — type, content, and destination are pinned by Steps 2 and 4.
- **Format, size, detail, audience** (the same four dials `references/output-spec.md` names for imports apply here too): `html` format, `doc-inline` size, `balanced` detail, `mixed` audience. This produces the self-contained `.html` deliverable Step 4 saves — never generate `svg` or `png` for this task.

---

## Step 4 — Draw and save the diagram

Follow the chosen type reference and the skill's general drawing guidance (semantic patterns if one applies, the anti-patterns list in SKILL.md §4, the complexity budget in §7) to render the model from Step 2 as a single self-contained HTML file with inline SVG and CSS.

Save it to `documentation/diagrams/architecture.html`, creating the `documentation/diagrams/` directory if this is the first run. Overwrite whatever is there — this file always reflects the current run, not a history of past ones.

---

## Step 5 — Verify what changed

```bash
git status --short
```

1. The only path that may appear is `documentation/diagrams/architecture.html` (or, on a first run, the new `documentation/diagrams/` directory containing it). If anything else changed — a reference file under `skills/diagram-design/`, a style-guide profile, application source — revert it (`git checkout -- <file>`, or remove an untracked one with `git clean -f -- <file>`) before continuing. This task draws; it does not customize the skill's shipped style or touch anything outside its one output file.
2. Open the file's contents (Read it) and sanity-check it is a complete, well-formed HTML document — a `<!doctype html>` (or `<html>`) start, a closing `</html>`, and the diagram's `<svg>` present in between. A truncated or empty file means the draw step did not finish — go back to Step 4 rather than shipping a broken artifact.
3. If the diff against the previous version is empty (the architecture is unchanged since the last run), that is a valid, if uneventful, outcome — skip Step 6 and report the run as a no-op in Step 7.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `docs` type subject, e.g.:

```
docs(architecture): regenerate system architecture diagram
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Diagram type:     architecture | dependency graph | uml class (<reason if not the default>)
Components drawn: <count> nodes, <count> connections
Guideline drift:  none | <what Step 1 found out of sync between architecture-principles.md and the current tree>
Output:           documentation/diagrams/architecture.html (new | regenerated | unchanged)
Commit:           <short-sha> pushed to master | push failed (see above) | no-op — diagram unchanged
```

Keep it brief. Done.
