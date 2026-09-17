# Generate Architecture Diagram

Your job: read the current shape of this codebase and produce a **set** of self-contained HTML architecture diagrams, one overview plus one per major component, drawn at module granularity, using the vendored [`diagram-design`](../../../skills/diagram-design/SKILL.md) skill to render them. This task **researches and draws**. It never edits application source, specs, or backlog files. It only reads the codebase and writes diagram files.

This is the expensive half of the diagram pair. Its sibling, [`generate-deployment-diagram.md`](generate-deployment-diagram.md), owns `documentation/diagrams/deployment.html` and draws five nodes across three host boundaries. This task draws several times that, because it works at a granularity the deployment diagram deliberately refuses:

| Task | Question | A node is | An edge is |
| --- | --- | --- | --- |
| `generate-deployment-diagram` | Where does each process run? | a host or process | a transport, with protocol and port |
| **this task** | How is the code organized, and what imports what? | a module or module group | an import, call, or registration |

Expect this task to take a while and to produce a lot of SVG. That is the point. Save each diagram as you finish it rather than holding them all to the end, so a run that stops early still leaves valid files on disk.

## Files this task owns

This task owns the `documentation/diagrams/architecture*.html` family and nothing else. It must never touch `deployment.html`.

- `architecture.html` is the **overview** and the entry point. It is deliberately *not* named `architecture-overview.html`, which is what [`references/output-spec.md`](../../../skills/diagram-design/references/output-spec.md) §3 suggests for a split. The flat name is a stable URL that `deployment.html` already links to, and renaming it would break that link for no gain. This is a deliberate deviation. Keep it.
- `architecture-<component>.html` is one detail diagram per major component, named for the component in kebab case.

Every run regenerates the whole family in place. It is a snapshot of the architecture as read *today*, not an append-only history. Step 5 deletes any `architecture-*.html` left over from a previous run that this run did not produce, so the directory never accumulates orphans describing code that has moved.

**No AI attribution, anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step, including the diagram skill's own confirmation prompts (SKILL.md §3 "Confirm before drawing" and the onboarding style-guide gate in §0). Steps 2 through 4 below tell you exactly what to choose in place of asking.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git. It never builds, tests, lints, or runs the app, so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean**, with no modified *and no untracked* files. This matters more than usual here: Step 6's commit stages everything with `git add -A`, so any stray file would be silently swept in. If the tree is not clean, STOP and report what is there. Do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result. No piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Read the codebase's own account, then count it

Read what the project already says about its own shape before reading source. It is the fastest, most authoritative map, and it keeps the diagrams from re-deriving something already documented and possibly getting it wrong.

1. [`ai/guidelines/architecture-principles.md`](../../guidelines/architecture-principles.md). The numbered principles describe the server/client split, the manager-per-resource model, the controller's role, the command registry, the parse/execute seam, and the shared wire contract. Each principle names real files and directories. Treat these as the skeleton, and note that principles 2, 3, and 5 each describe a *pressure point* rather than a settled structure, which is exactly the kind of thing a module-level diagram should show.
2. `CLAUDE.md`'s "Project structure" section for the top-level map.
3. [`ai/guidelines/react-code-organization.md`](../../guidelines/react-code-organization.md) for how `web/src/` is meant to be organized: feature directories over type-named buckets, the one-way `shared → feature → app` dependency flow, and no cross-feature imports. The web diagrams should make it visible whether that flow actually holds.
4. [`ai/guidelines/imports-and-barrel-files.md`](../../guidelines/imports-and-barrel-files.md), since this task draws imports and needs to know which ones the project considers legitimate.
5. Skim `product/specs/` filenames. A subsystem with a spec is a named, load-bearing component. A subsystem without one is usually an implementation detail worth collapsing into its neighbour.

Then count the tree, because the counts decide how many diagrams this run produces:

```bash
ls src/
ls web/src/
find src -mindepth 2 -name '*.ts' -not -name '*.test.ts' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn
find web/src -mindepth 2 \( -name '*.ts' -o -name '*.tsx' \) -not -name '*.test.*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn
find src -maxdepth 1 -name '*.ts' -not -name '*.test.ts' | wc -l
find web/src -maxdepth 1 \( -name '*.ts' -o -name '*.tsx' \) -not -name '*.test.*' | wc -l
```

Those two `find | sed | sort | uniq` pipelines count non-test modules per directory and report nested directories separately, which is the signal you want: a directory whose children carry most of its weight (`src/plugins` and its bundled plugin folders, `web/src/shared` and its sub-surfaces) is telling you where a zone boundary belongs. The pipelines are deliberately written without `$(...)` capture, per the hygiene rule above.

Note anywhere the guidance and the tree disagree: a file a principle names that no longer exists, a new top-level directory `CLAUDE.md` does not mention, a `web/src/` directory that is a type-named bucket rather than a feature. Diagram what you observe on disk. If a disagreement is material, report it in Step 7 rather than silently picking one source over the other.

---

## Step 2 — Decide the diagram set

The counts from Step 1 decide this, not a fixed list. Apply these rules in order.

**Granularity.** A node is a directory under `src/` or `web/src/`, or a named group of loose root-level modules that serve one concern. A node is never a single file, unless that file is the whole of something (`src/managers.ts`, `src/protocol.ts`). An edge is a real relationship you can point at in code: an import, a registration into a registry, a call through an adapter.

**Sizing.** A detail diagram holds at most **24 nodes** and must be zoned above 9. Work out how many diagrams each side needs by dividing its directory count plus its root-module groups by that ceiling, then adjusting on concern boundaries rather than on arithmetic.

**The floor.** The set always includes the overview, at least one `server` diagram, and at least one `web` diagram. Beyond that, split and merge by these two tests:

- **Split** when a candidate would exceed 24 nodes, or when it spans two concerns that share almost no edges. Two weakly-connected halves on one canvas is two diagrams pretending to be one.
- **Merge** when two candidates would each land under about 8 nodes. A diagram that thin should have been a paragraph, and SKILL.md §2 says so.

At the time of writing, `src/` held 32 subdirectories and 64 loose root modules, and `web/src/` held 12 subdirectories and 72 loose root modules. Those numbers produce roughly this set, which is a reasonable starting point to confirm or revise, not a list to copy:

| File | Covers |
| --- | --- |
| `architecture.html` | overview: the whole system, one node per detail diagram |
| `architecture-server-dispatch.html` | the intent path: `index.ts`, message handlers, `controller/`, `command/`, `commands/`, `recognizers/`, `completion/` |
| `architecture-server-managers.html` | `managers.ts` and the per-resource owners: `tab/`, `shell/`, `acp/`, `harness/`, `schedule/`, `browser/`, `monitor/`, `file-navigator/`, `editor/`, and the rest |
| `architecture-server-platform.html` | boot, security, and reach: `main.ts`, `cli-args.ts`, `config.ts`, `security.ts`, `sandbox/`, `remote/`, `ssh*.ts`, `git/`, `project/` |
| `architecture-server-plugins.html` | `src/plugins/`, the largest single directory in the tree |
| `architecture-web-shell.html` | the app shell and tab system: `App.tsx`, `AppShell.tsx`, `TabStrip.tsx`, `ws.ts`, the state hooks, the dialogs |
| `architecture-web-features.html` | the feature directories: `editor/`, `file-navigator/`, `pickers/`, `agent-tabs/`, `harness/`, `plugins/`, `shared/` |

**The overview is the index.** It carries one node per detail diagram, plus the shared wire contract that both sides import, drawn as the seam it is. Every detail file this run produces must appear on it. If a component is important enough for its own diagram, it is important enough to appear on the overview, and the reverse holds too.

**What to leave out of every diagram.** Test files. Anything a principle calls a shadow system or a deleted pattern, since nothing that no longer exists should appear anywhere. Barrel re-exports that add no relationship of their own.

If, while building a particular detail model, you judge that a dependency graph tells that component's story better than a component diagram, you may choose [`references/type-dependency.md`](../../../skills/diagram-design/references/type-dependency.md) for that one file. Its budget is much tighter (9 nodes, 14 edges), so this is a real trade and usually the wrong one at this granularity. A UML class diagram ([`references/type-uml-class.md`](../../../skills/diagram-design/references/type-uml-class.md)) is right only for a component whose story genuinely is a class hierarchy. Note any such substitution in Step 7.

---

## Step 3 — Load the diagram-design skill and set the dials per diagram

Invoke the `diagram-design` skill (`skills/diagram-design/SKILL.md`, vendored from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), MIT-licensed, see `skills/diagram-design/LICENSE` and `THIRD_PARTY_LICENSES.md`) via the Skill tool. Load [`references/type-architecture.md`](../../../skills/diagram-design/references/type-architecture.md) before drawing, per SKILL.md §3.

Fixed choices. Do not ask, do not pause, do not deviate:

- **Style-guide gate (SKILL.md §0):** this task's explicit, standing choice is the shipped default style guide. Never trigger `references/onboarding.md`, never fetch a URL for brand tokens, never write a profile. If `references/style-guide.md` still carries the shipped tokens, that satisfies the gate as-is. Proceed.
- **Confirm-before-drawing (SKILL.md §3):** skip the pause. This document *is* the confirmation.
- **Format:** `html` for every diagram. Never generate `svg` or `png` for this task.

The other three dials differ by diagram:

| Dial | Overview | Detail diagrams |
| --- | --- | --- |
| **Size** | `doc-inline` (`0 0 960 600`) | `doc-wide` (`0 0 1280 720`) |
| **Detail** | `balanced` (≤12 nodes) | `faithful` (≤24 nodes, zoned) |
| **Audience** | `engineer` | `engineer` |

Three notes on why:

`engineer` everywhere, including the overview, is what this task is for. It means exact module and directory names, real file paths in sublabels, and edge labels that say `imports` or `registers` rather than vague verbs. The sibling deployment task uses `engineer` for protocols and ports; this one uses it for paths and symbols. Neither uses `mixed`.

`faithful` is the only detail level that exempts a diagram from the SKILL.md §7 complexity budget, and it comes with conditions that are not optional: zoning is mandatory above 9 nodes (2 to 4 labelled zones), the six connector rules in SKILL.md §6 still apply at 24 nodes, and accent stays at 2 elements no matter how many nodes there are. More nodes never buys more coral.

`doc-wide` is required for the detail diagrams because 24 zoned nodes do not fit in the overview's canvas. Do not shrink the type ramp to make nodes fit. If a `doc-wide` layout will not route without overlapping connectors, that is the size dial telling you the diagram is over its real ceiling. Split it and go back to Step 2.

---

## Step 4 — Draw and save each diagram

Draw the overview first, since it fixes the component names and the file list every detail diagram cross-references. Then draw the detail diagrams.

Follow the type reference and the skill's general drawing guidance: the semantic patterns if one applies, the anti-pattern list in SKILL.md §4, the six mandatory connector rules in §6, and the zone grammar in `type-architecture.md`. Zones are drawn first, then arrows, then arrow labels, then nodes.

**Cross-link the set.** Each file's HTML wrapper carries a small navigation strip above the diagram, outside the `<svg>`, linking its siblings by relative filename. On the overview that strip is the index of every detail diagram. On a detail diagram it links back to `architecture.html` and names which overview node this file expands. Keep it in the wrapper. Never put navigation inside the SVG, where it would collide with the legend rules.

**Accent discipline gets harder here, not easier.** Each diagram picks its own 1 to 2 focal elements, and they should be the thing that diagram exists to show: the seam under pressure, the registry everything routes through, the one edge that crosses a boundary it should not. Do not accent the same node on every diagram just because it is important overall.

Save each file to `documentation/diagrams/` as you finish it. Then run the skill's own check on every file produced:

```bash
python3 skills/diagram-design/scripts/self_check.py documentation/diagrams/architecture.html
```

Repeat per file. Each must print `OK`. Anything else means fix that file before moving on.

Because the set shares a directory, every `<svg>` needs its own `<title>` and `<desc>` ID prefix matching its filename slug (`architecture-server-managers-title`, and so on). SKILL.md §12 bans bare `title` and `desc` IDs for exactly this reason, and a family of files in one folder is the case it is guarding against.

---

## Step 5 — Verify what changed

```bash
git status --short
ls documentation/diagrams/
```

1. The only paths that may appear are `documentation/diagrams/architecture*.html`. `deployment.html` must be untouched. If anything else changed, a reference file under `skills/diagram-design/`, a style-guide profile, application source, revert it (`git checkout -- <file>`, or remove an untracked one with `git clean -f -- <file>`) before continuing. This task draws. It does not customize the skill's shipped style.
2. **Delete orphans.** Any `architecture-*.html` in the directory that this run did not produce describes a component that no longer exists under that name. Remove it with `git rm` (or plain `rm` if untracked) and name it in the Step 7 report. An orphan diagram is worse than a missing one, because it looks current.
3. Read each file and sanity-check that it is a complete, well-formed HTML document: a `<!doctype html>` (or `<html>`) start, a closing `</html>`, and the diagram's `<svg>` present in between. A truncated or empty file means the draw step did not finish for that diagram. Go back to Step 4 for that file rather than shipping a broken artifact.
4. Check the cross-links resolve: every filename named in the overview's navigation strip exists on disk, and every detail file links back to `architecture.html`.
5. If the diff is empty across the whole family, the architecture is unchanged since the last run. That is a valid, if uneventful, outcome. Skip Step 6 and report the run as a no-op in Step 7.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the whole set as one commit on `master` and push it to the remote. Use a `docs` type subject, e.g.:

```
docs(architecture): regenerate module architecture diagram set
```

The body should name how many diagrams the set holds and what changed in the decomposition since the last run, since that is the part a reader cannot see from the file list alone. The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote. No separate merge step is needed.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Diagram set:      <count> files (1 overview + <count> detail)
Dials:            overview doc-inline/balanced/engineer · detail doc-wide/faithful/engineer

  <filename>                      <nodes> nodes, <edges> edges, <zones> zones
  <filename>                      <nodes> nodes, <edges> edges, <zones> zones
  ...

Decomposition:    unchanged | <what split, merged, or was renamed since the last run>
Type swaps:       none | <file>: dependency | uml class (<reason>)
Orphans removed:  none | <filenames deleted in Step 5>
Guideline drift:  none | <what Step 1 found out of sync between the guidelines and the tree>
Commit:           <short-sha> pushed to master | push failed (see above) | no-op — set unchanged
```

Keep it brief. Done.
