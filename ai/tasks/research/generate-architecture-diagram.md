# Generate Architecture Diagram

Your job: read the current shape of this codebase and produce **one** self-contained HTML architecture diagram summarizing it, using the vendored [`diagram-design`](../../../skills/diagram-design/SKILL.md) skill to render it. This task **researches and draws**. It never edits application source, specs, or backlog files. It only reads the codebase and writes one diagram file.

This task edits **one file only**: `documentation/diagrams/architecture.html`. Every run regenerates that file in place. It is a snapshot of the architecture as read *today*, not an append-only history. If the file does not exist yet, this run creates it.

An earlier revision of this task produced a set of per-component detail diagrams alongside the overview. It no longer does. One diagram at the system altitude is the deliverable; per-component expansions were more surface than signal. Step 5 deletes any `architecture-<component>.html` left behind by that revision.

Its sibling, [`generate-deployment-diagram.md`](generate-deployment-diagram.md), owns `documentation/diagrams/deployment.html` and answers a different question:

| Task | Question | A node is | An edge is |
| --- | --- | --- | --- |
| **this task** | What are the parts of the system, and what talks to what? | a component or registry | a call, dispatch, or import |
| `generate-deployment-diagram` | Where does each process run? | a host or process | a transport, with protocol and port |

Neither task touches the other's file.

**No AI attribution, anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere. The commit's configured git author is the only authorship ever recorded.

**Ask once, then run to completion.** Step 3 puts one `AskUserQuestion` call in front of the user to settle the dials that change what the picture looks like. That is the only interruption. Never trigger the skill's own onboarding gate (SKILL.md §0) and never pause at its confirm-before-drawing prompt (SKILL.md §3) — Step 3 replaces both.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git. It never builds, tests, lints, or runs the app, so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean**, with no modified *and no untracked* files. This matters more than usual here: Step 6's commit stages everything with `git add -A`, so any stray file would be silently swept in. If the tree is not clean, STOP and report what is there. Do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result. No piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see AGENTS.md) and cost a wasted call each time.

---

## Step 1 — Read the codebase's own account of its architecture

Read what the project already says about its own shape before reading source. It is the fastest, most authoritative map, and it keeps the diagram from re-deriving something already documented and possibly getting it wrong.

1. [`ai/guidelines/architecture-principles.md`](../../guidelines/architecture-principles.md). The numbered principles describe the server/client split, the manager-per-resource model, the controller's role, the command registry, the parse/execute seam, and the shared wire contract. Each principle names real files and directories. Treat these as the skeleton, and note that principles 2, 3 and 5 each describe a *pressure point* rather than a settled structure.
2. `AGENTS.md`'s "Project structure" section for the top-level map.
3. [`ai/guidelines/react-code-organization.md`](../../guidelines/react-code-organization.md) for how `web/src/` is organized: feature directories, the one-way `shared → feature → app` flow, no cross-feature imports.
4. Skim `product/specs/` filenames. A subsystem with a spec is a named, load-bearing component. A subsystem without one is usually an implementation detail worth collapsing into its neighbour.

Then confirm the guidance still matches the tree, since the guidelines describe sizes and structures that shift:

```bash
ls src/
ls src/plugins/
ls web/src/
ls web/src/plugins/
wc -l src/controller.ts
```

Note anywhere the guidance and the tree disagree: a file a principle names that no longer exists, a new top-level directory `AGENTS.md` does not mention, sizes that have moved. Diagram what you observe on disk. If a disagreement is material, report it in Step 7 rather than silently picking one source over the other.

---

## Step 2 — Build the component model

From Step 1, assemble the model the diagram will render. Do this as notes, not as diagram markup yet.

**Components.** The server (`src/`), the web client (`web/src/`), the shared wire contract (`src/protocol.ts` / `@shared/protocol`), the plugin host (`src/plugins/`) and its client counterpart, the CLI entry (`bin/janus.mjs`), and the manager registry (`Managers` and the load-bearing owners named in principle 2). Include a manager as its own node only if it carries weight at this altitude. The point is the system's shape, not an inventory.

**Connections.** The one WebSocket between server and client; the command dispatch path (`Controller` → `CommandManager` → `src/commands/*.ts` → the `Managers` registry, per principles 3 and 5); the parse/execute seam (principle 4); the shared protocol both sides import (principle 7). Only draw a connection that carries real information — per SKILL.md §1, a connection obvious from layout is not worth a line.

**What to leave out.** Individual files below the component level, test files, and anything a principle calls a shadow system or a deleted pattern. Nothing that no longer exists should appear.

The node budget comes from the detail dial the user picks in Step 3, so hold the model loosely until then: know which components you would cut first if the budget tightens, and which you would add if it loosens.

---

## Step 3 — Confirm the settings with the user

Make **one** `AskUserQuestion` call carrying the four questions below. Every question leads with the recommended default, and every option says what it does to the picture rather than naming a dial. The user can answer some and skip others; anything unanswered keeps its default.

**If the user is not reachable** — a scheduled run, a non-interactive session, or an explicit instruction to run unattended — skip the call, take every default, and say so on the `Settings` line in Step 7.

| Question | Header | Options (default first) |
| --- | --- | --- |
| How large should the canvas be? | `Canvas` | **Body width** — 960×600, sits inline in a README or docs page at normal reading size. · **Full width** — 1280×720, more room per node and for longer labels; better on a wiki page than in a narrow column. · **Slide** — 1280×720 with presentation type, readable projected, but bigger type means noticeably fewer nodes fit. |
| How much of the system should it show? | `Detail` | **Balanced** — about 12 components, technical sublabels on the four that need them; the whole system without a guide. · **Simplified** — about 7 components, no sublabels; reads in one glance, loses the plugin host and the wire contract. · **Faithful** — up to 24 components in labelled zones; a dense single canvas showing individual managers and command modules, and it will need a moment to read. |
| How should things be labelled? | `Labels` | **Real paths** — components named as in code, with `src/managers.ts`-style sublabels; best for someone about to open the files. · **Plain names** — component names and plain verbs, no paths or filenames; best for a mixed audience. · **Capabilities** — what each part does for the user, no code references at all. |
| What should the diagram centre on? | `Focus` | **Client and server** — the socket between them and the authority split; the default story. · **The dispatch path** — an intent becoming an effect, through the command registry. · **Resource ownership** — the manager-per-resource model and what a tab owns. |

The `Focus` answer decides which one or two elements get the accent, and it may reorder the layout, but it never changes what the diagram is *of*. All three focuses draw the same system.

---

## Step 4 — Load the diagram-design skill and draw

Invoke the `diagram-design` skill (`skills/diagram-design/SKILL.md`, vendored from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), MIT-licensed, see `skills/diagram-design/LICENSE` and `THIRD_PARTY_LICENSES.md`) via the Skill tool, then load [`references/type-architecture.md`](../../../skills/diagram-design/references/type-architecture.md) before drawing.

Fixed choices, not up for negotiation in Step 3:

- **Visual type:** `type-architecture.md`. Use [`references/type-dependency.md`](../../../skills/diagram-design/references/type-dependency.md) instead only if Step 2 concluded a dependency graph tells the more useful story this run, or [`references/type-uml-class.md`](../../../skills/diagram-design/references/type-uml-class.md) if the run is specifically about a class hierarchy. Note any substitution in Step 7.
- **Style-guide gate (SKILL.md §0):** this task's explicit, standing choice is the shipped default style guide. Never trigger `references/onboarding.md`, never fetch a URL for brand tokens, never write a profile. If `references/style-guide.md` still carries the shipped tokens, that satisfies the gate as-is. Proceed.
- **Format:** `html`. Never generate `svg` or `png` for this task.

Map the Step 3 answers onto the skill's dials in [`references/output-spec.md`](../../../skills/diagram-design/references/output-spec.md):

| Step 3 answer | Dial |
| --- | --- |
| Body width / Full width / Slide | size `doc-inline` / `doc-wide` / `slide-16x9` |
| Balanced / Simplified / Faithful | detail `balanced` / `simplified` / `faithful` |
| Real paths / Plain names / Capabilities | audience `engineer` / `mixed` / `executive` |

If the user picked **Faithful**, its conditions are not optional: zoning is mandatory above 9 nodes (2 to 4 labelled zones), the six connector rules in SKILL.md §6 still apply at 24 nodes, and accent stays at 2 elements no matter the node count. More nodes never buys more coral.

Draw the model from Step 2 as a single self-contained HTML file with inline SVG and CSS, following the anti-pattern list in SKILL.md §4 and the zone grammar in `type-architecture.md`. Zones are drawn first, then arrows, then arrow labels, then nodes.

Give the file a short prose subtitle above the diagram naming what it is and linking `deployment.html`, and keep the SVG's `<title>` and `<desc>` ids prefixed `architecture-` so the file can share a directory with its sibling.

### The provenance stamp

Every diagram carries the date it was generated and the commit it was read from, **inside the `<svg>`**, right-aligned in the lower margin on the legend strip's header row. Inside the SVG and not in the HTML wrapper, because [`references/export.md`](../../../skills/diagram-design/references/export.md) drops editorial wrappers when exporting to PNG or SVG — a stamp in the wrapper would vanish exactly when the image is separated from this page and most needs to say where it came from.

Read both values immediately before drawing:

```bash
git rev-parse --short HEAD
date -u +%Y-%m-%d
```

Type the literals into the file; do not shell-capture them (see the hygiene rule in Step 0). The sha is **the commit the tree was read at**, not the commit that will contain the diagram — that one does not exist until Step 6, and a stamp cannot name its own commit without an amend. The `READ` prefix says so out loud, and the value is what lets a reader check the diagram against the tree it describes.

```svg
<!-- y = the same baseline as this file's own LEGEND eyebrow, whatever it is.
     x = viewBox width minus the 40px outer margin (920 at doc-inline, 1240 at doc-wide). -->
<text x="920" y="528" fill="rgba(45,49,66,0.40)" font-size="8"
      font-family="'Geist Mono', monospace" text-anchor="end"
      letter-spacing="0.08em">READ 2026-01-31 · 1a2b3c4d</text>
```

Do not copy the `y` from this snippet. The legend strip floats up when the zones end higher, so read the baseline off the `LEGEND` text element you just wrote and reuse it — the stamp and the eyebrow must sit on one line, or the strip reads as two ragged rows.

This is a deliberate deviation from the safe-area rule in [`output-spec.md`](../../../skills/diagram-design/references/output-spec.md) §2, which reserves the bottom 60px for the legend and nothing else. The stamp shares that band with the `LEGEND` eyebrow, opposite it on the same baseline, and at 40% ink it reads as chrome rather than as a legend entry. Keep it there; do not give it its own row and do not grow the `viewBox` to make room.

Save to `documentation/diagrams/architecture.html`, creating `documentation/diagrams/` if this is the first run. Overwrite whatever is there. Then:

```bash
python3 skills/diagram-design/scripts/self_check.py documentation/diagrams/architecture.html
```

It must print `OK`. Anything else means fix the file before continuing.

---

## Step 5 — Verify what changed

```bash
git status --short
ls documentation/diagrams/
```

1. The only path that may appear is `documentation/diagrams/architecture.html` (or, on a first run, the new `documentation/diagrams/` directory containing it). `deployment.html` must be untouched. If anything else changed — a reference file under `skills/diagram-design/`, a style-guide profile, application source — revert it (`git checkout -- <file>`, or remove an untracked one with `git clean -f -- <file>`) before continuing. This task draws; it does not customize the skill's shipped style.
2. **Delete stale detail diagrams.** If any `architecture-<component>.html` files are present, they are left over from the revision of this task that produced a diagram set. Remove them with `git rm` and name them in the Step 7 report. Check that `architecture.html` links to none of them.
3. Read the file and sanity-check that it is a complete, well-formed HTML document: a `<!doctype html>` (or `<html>`) start, a closing `</html>`, and the diagram's `<svg>` present in between. A truncated or empty file means the draw step did not finish — go back to Step 4 rather than shipping a broken artifact.
4. **Check whether anything but the stamp changed.** The provenance stamp carries today's date, so the file now differs on every run whether or not the architecture moved. An empty diff is no longer the no-op signal; a diff confined to the stamp is.

   ```bash
   git diff -U0 documentation/diagrams/architecture.html
   ```

   If the only changed lines are the stamp's `<text>` element, the architecture is unchanged since the last run at these settings. Revert the file with `git checkout -- documentation/diagrams/architecture.html`, skip Step 6, and report the run as a no-op in Step 7. Re-stamping an otherwise identical diagram would put a commit in the history that claims a change it does not contain.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `docs` type subject, e.g.:

```
docs(architecture): regenerate system architecture diagram
```

The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote. No separate merge step is needed.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Diagram type:     architecture | dependency graph | uml class (<reason if not the default>)
Settings:         <canvas> · <detail> · <labels> · <focus>   (defaults | user-chosen | defaults — user not reachable)
Components drawn: <count> nodes, <count> connections, <count> zones
Left out:         none | <what the detail level forced out>
Guideline drift:  none | <what Step 1 found out of sync between the guidelines and the tree>
Stale files:      none | <architecture-*.html removed in Step 5>
Output:           documentation/diagrams/architecture.html (new | regenerated | unchanged)
Commit:           <short-sha> pushed to master | push failed (see above) | no-op — diagram unchanged
```

Keep it brief. Done.
