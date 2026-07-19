# Improve User Documentation (one functional area per run)

Your job: pick **one** functional area of the application from the checklist in Step 2, compare
what it actually does (per its spec and source) to what `documentation/user-documentation/` and
`help.md` currently say, and fix the gap — then prove the docs still build. Do exactly one area,
then verify.

This task edits **markdown files only**. You will never touch application source code, tests, or
config. There is no test suite to run for this task.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No
`Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or
badges, no AI authorship notes anywhere in the files you write. The commit's configured git author
is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step. Only stop
early if the docs site isn't green before you start (Step 1), or if every candidate area on the
checklist is blocked (see "Blocked work" below).

---

## Files you may touch

Only these, ever:

- `documentation/user-documentation/**/*.md` (edit existing pages, or add a new page in the folder
  that matches its topic)
- `help.md` (the in-app quick-reference: a `Commands` table and a `Key Bindings` table — keep
  entries there terse, one line each)

Never edit `product/specs/`, `src/`, `web/src/`, `ai/`, or any config file.

## Blocked work — skip and pick the next checklist item

Skip an area and move to the next one on the Step 2 checklist, without asking, if:

1. Fixing it would require changing application **source code** — the docs and the app disagree,
   and the app is right, or fixing it isn't a doc change. Document the app's actual behavior, note
   the mismatch in your Step 7 report, and do **not** edit source.
2. You read the spec and the existing doc/help text side by side and they already agree — no real
   gap. Don't make a cosmetic edit just to have something to show.

If every checklist item is blocked, report which ones you checked and why, and stop without
changing any files.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Confirm the docs build cleanly right now

```bash
npm run docs:build 2>&1
```

This must finish with **no errors**. If it already fails before you touch anything, STOP and tell
the user — do not start doc work on a broken site.

---

## Step 2 — Pick exactly one functional area

Go down this list **in order**. For each one, run its check command. Stop at the **first** area
where the check shows a real gap (missing page, or content that looks stale/incomplete compared to
the spec). If an area's check shows good, up-to-date coverage, move to the next item.

| # | Area | Spec file(s) | Check command |
|---|------|--------------|----------------|
| 1 | Browser driving (`browser` command) | `product/specs/browser.md` | `find documentation/user-documentation -iname '*browser*'` |
| 2 | SSH tabs (`ssh` command) | `product/specs/ssh-tab.md` | `find documentation/user-documentation -iname '*ssh*'` |
| 3 | Monitors (`monitor`/`unmonitor`/`monitors`) | `product/specs/monitoring.md` | `find documentation/user-documentation -iname '*monitor*'` |
| 4 | Messaging (`msg`/`broadcast`) | `product/specs/messaging.md` | `find documentation/user-documentation -iname '*msg*' -o -iname '*message*' -o -iname '*broadcast*'` |
| 5 | Quick open (`Ctrl+A` / quick-open) | `product/specs/quick-open.md` | `find documentation/user-documentation -iname '*quick-open*'` |
| 6 | Connections (`connection` command) | `product/specs/connection.md` | `find documentation/user-documentation -iname '*connection*'` |
| 7 | Themes (`theme`/`syntax theme`) | `product/specs/application-themes.md` | `find documentation/user-documentation -iname '*theme*'` |
| 8 | Comments | `product/specs/comments.md` | `find documentation/user-documentation -iname '*comment*'` |
| 9 | Databases (`db` command) | `product/specs/database.md` | `find documentation/user-documentation -iname '*database*' -o -iname '*db*'` |
| 10 | Anything else with a spec but no matching page | pick from `ls product/specs` | `find documentation/user-documentation -iname '*<keyword>*'` |

If the check command finds **no matching file**, that's very likely a real gap (an undocumented
feature) — you can stop searching and go with it. If it finds a file, open both that file and the
spec and read them side by side before deciding whether there's a gap.

If you get through the whole table with nothing blocked and nothing gapped, fall back to checking
whether any *existing* page in `documentation/user-documentation/` describes a command whose
`help.md` entry doesn't match — read `help.md` top to bottom against `product/specs/` and pick the
first mismatch you find.

State your pick in one sentence: the area, the spec file, and the doc page/`help.md` section
(or "no page exists yet").

---

## Step 3 — Research

1. Read the spec file(s) for your chosen area in full. Note the exact command syntax, flags, and
   any verbatim error/usage messages — you'll reuse these exactly, not paraphrase them.
2. If the spec is ambiguous about something, grep the relevant `src/` or `web/src/` file to check
   — read only, never edit.
3. Read the existing doc page(s) and `help.md` entry for this area (if any) and write down, in
   plain terms, what's wrong: missing / stale / wrong syntax / wrong example / doesn't exist yet.
4. **Check git history for functionality added after the docs were written.** A spec being
   accurate doesn't mean the doc page kept up. Run one command:

   ```bash
   git log --oneline -20 -- <spec file path>
   ```

   (If you already know the source file from step 2 above, tack it onto the same command:
   `git log --oneline -20 -- <spec file path> <src file path>`. If not, the spec path alone is
   fine — skip guessing at source paths.)

   The newest commits are at the top. Skim the subject lines for anything that sounds like a new
   flag, a new subcommand, a rename, or removed behavior. For any subject that's unclear or looks
   doc-relevant, run `git show <hash>` to read that one commit before writing anything, and fold
   what you find into your notes from step 3 above — that's the functionality most likely missing
   from the current docs.

---

## Step 4 — Write the update

Pick where the content belongs before you write:

- **New page or existing page?** If a page already covers this area, edit it. If not, add a new
  `.md` file in the `documentation/user-documentation/` subfolder that best matches the topic
  (look at the existing subfolders: `getting-started/`, `command-bar/`, `automation/`,
  `advanced-agents/`, `tab-types/`, `workflows/` — put it where a reader would expect to find it).
- **`help.md` too?** If the command/key binding is new or its description changed, update its row
  in `help.md`'s `Commands` or `Key Bindings` table. Keep it to the existing one-line style — don't
  turn `help.md` into a second copy of the full doc page; link isn't needed there since it's
  in-app, just keep the one-liner accurate.

Follow this checklist while writing (full detail in [`user-documentation.md`](../guidelines/user-documentation.md)
and [`human-writing-guidelines.md`](../guidelines/human-writing-guidelines.md) if you want more):

- [ ] First sentence states what the reader can now do — not background or internals.
- [ ] A runnable example/command appears before any explanation of flags or edge cases.
- [ ] No file paths, function/module/class names, or "why we built it this way" engineering
      rationale — that belongs in `product/specs/`, never here.
- [ ] Command names, flags, and error messages are copied **verbatim** from the spec.
- [ ] Commands, flags, file paths, and key chords are in `monospace` (`Ctrl+R`, not "control R").
- [ ] Headings are sentence case and describe the task (`Close a page tab`, not `Closing`).
- [ ] Second person, active voice, present tense.
- [ ] Short sentences, one idea each, plain words over fancy ones, no filler phrases ("it's worth
      noting that", "in conclusion").
- [ ] No em dashes, no AI-sounding words (utilize, leverage, delve, robust, seamlessly,
      comprehensive, nuanced, pivotal), no formulaic three-point structure.
- [ ] If a concept is fully explained on another page, link to it instead of repeating it.

Do not touch anything outside `documentation/user-documentation/` and `help.md`.

---

## Step 5 — Verify

```bash
npm run docs:build 2>&1
```

1. Must still finish with **no errors**. If it fails and the fix is obviously in the file you just
   edited (typo, bad link, bad frontmatter), fix it and rerun. If you can't get it clean quickly,
   revert your changes with `git checkout -- <files you touched>` and report what blocked you.
2. Run `git status` and confirm every changed file is under `documentation/user-documentation/`
   or is `help.md` — nothing else should appear.
3. Re-read the page(s) you changed once, straight through, as if you'd never seen them. Confirm
   the first sentence states the goal and there's no leftover implementation detail.

---

## Step 6 — Report

Give the user a short report in this exact shape:

```
Functional area:  <name, e.g. "browser driving">
Source material:  <spec file(s) you read>
Docs touched:     <path(s) of the doc pages / help.md rows you changed or created>
Gap closed:       <one or two sentences — what was missing or wrong, and what you did about it>
Docs build:       clean / <errors, if any>
```

Keep it brief. Done.
