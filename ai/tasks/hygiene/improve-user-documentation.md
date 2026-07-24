# Improve User Documentation (one backlog item per run)

Your job: take the **top** candidate from `product/backlog/user-documentation.md` — the gap
backlog maintained by [`find-user-documentation-gaps.md`](../research/find-user-documentation-gaps.md) —
verify its gap description against the spec and source, fix the gap in
`documentation/user-documentation/` and `help.md`, add visuals — character sprites per the
guidelines, and a screenshot captured with the docs-screenshots pipeline whenever the page
documents visible UI (see Step 4b) — prove the docs still build, and then remove the worked
item from the backlog's candidates. Do exactly one item, then verify.

This task edits **documentation files only**. You will never touch application source code,
specs, or tests, with one narrow exception: adding a `data-doc-shot` attribute to an existing
JSX element in `web/src/` so a screenshot has something to crop to (see Step 4b) — nothing else
in source ever changes. The only non-markdown files you may edit are the docs sidebar (and, if a
new sprite facing is needed, the `FACINGS` array) in `documentation/.vitepress/config.mts`, the
screenshot manifest `scripts/docs-screenshots/manifest.mjs` when a page needs a new or updated
screenshot (see Step 4b), and that one-attribute `data-doc-shot` addition in `web/src/`. There is
no test suite to run for this task.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No
`Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or
badges, no AI authorship notes anywhere in the files you write. The commit's configured git author
is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step. Only stop
early if the docs site isn't green before you start (Step 1), if the backlog has no candidates
(Step 2), or if every candidate in the backlog is blocked (see "Blocked work" below).

---

## Files you may touch

Only these, ever:

- `documentation/user-documentation/**/*.md` (edit existing pages, or add a new page in the folder
  that matches its topic)
- `help.md` (the in-app quick-reference: a `Commands` table and a `Key Bindings` table — keep
  entries there terse, one line each)
- `documentation/.vitepress/config.mts` (**only** the `sidebar` entries to register a new page
  you created — the build won't fail on an unregistered page, it just becomes unreachable in the
  site nav, so this registration is part of adding a page, not optional — and **only** the
  `FACINGS` array when a sprite you're placing needs a facing not yet listed there)
- `scripts/docs-screenshots/manifest.mjs` (**only** to add or update the entry for a screenshot
  your page references — see Step 4b)
- `documentation/public/screenshots/*.png` (generated output of `./scripts/run.mjs
  docs-screenshots` — commit the PNGs the capture produces; never hand-edit them)
- `web/src/**/*.tsx` (**only** to add a single `data-doc-shot="<name>"` attribute to an existing
  JSX element, so a new screenshot has something to crop to — see Step 4b. Never add, remove, or
  restructure markup, never touch component logic, styles, or any other attribute)
- `product/backlog/user-documentation.md` (only to remove the item you completed — see Step 6)

Never commit anything under `documentation/public/agents/` — it is gitignored build output; the
sprite sources live in `agent-images/` and are copied at build time.

Never edit `product/specs/`, `src/`, `ai/`, or any other config file. In `web/src/`, the single
`data-doc-shot` attribute addition above is the only change ever allowed — everything else in
that tree is off limits.

## Blocked work — skip and take the next backlog candidate

Skip an item and move to the next candidate in the backlog, without asking, if:

1. Fixing it would require changing application **source code** — the docs and the app disagree,
   and the app is right, or fixing it isn't a doc change. Document the app's actual behavior, note
   the mismatch in your Step 7 report, and do **not** edit source. (This does not cover adding a
   `data-doc-shot` attribute for a screenshot per Step 4b — that one narrow exception is allowed;
   it is still blocked work if the element you'd need to tag doesn't exist yet and would require
   adding markup, not just tagging something already there.)
2. You re-verify the gap and it has already been closed — the spec and the existing doc/help text
   now agree. Don't make a cosmetic edit just to have something to show. Remove the entry from
   the backlog's `candidates` per Step 6 (note it as already resolved) and take the next one.

A skipped-as-blocked item (case 1) keeps its backlog entry — only worked or already-resolved
items are removed. If every candidate is blocked, report which ones you checked and why, and
stop without changing any doc files.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else. Then confirm a clean
starting point with `git status` — no modified *and no untracked* files (an install can rewrite
`package-lock.json`; if it did and you did not change dependencies, revert it with
`git checkout -- package-lock.json`). If the tree still is not clean, STOP and report what is
there — a dirty tree makes the Step 5 ownership check meaningless, because you can no longer
tell your changes from pre-existing ones.

**Command hygiene for the whole run:** run each command plainly and read its output from the
result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger
permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each
time. If you need to filter a slow command's output (the docs build, a long git log) more than
once, save the output with the **Write tool** to `./temp/` and grep that file.

---

## Step 1 — Confirm the docs build cleanly right now

```bash
npm run docs:build 2>&1
```

This must finish with **no errors**. If it already fails before you touch anything, STOP and tell
the user — do not start doc work on a broken site.

The build is slow — run it exactly twice in a normal run: once here, once in Step 5. Read the
result from the tool output; do not re-run it to filter differently. Note that the build fails
on dead links (that's your Step 5 safety net for link typos), but it does **not** fail on a page
missing from the sidebar — that check is manual (Step 5).

---

## Step 2 — Take the top backlog item

Read `product/backlog/user-documentation.md` in full. The `candidates` section is sorted by
score, highest first — your item is the **first** bullet in `candidates`. Do not shop around the
list for an item you'd rather do; go top-down, moving to the next candidate only when the
"Blocked work" rules above say to skip.

Also note the `Last run:` date at the top of the file — that is when the gap descriptions were
last verified, and Step 3 uses it to scope its git-history check. If it is missing or
unparseable, treat it as 3 months ago.

Each candidate bullet already names the area ID, the score, the fact counts, the most important
missing or wrong facts, the ground-truth files (spec and source), and where the fix belongs.
That is your work order — Step 3's research focuses on verifying and completing it, not
re-deriving it.

If the backlog file does not exist, or its `candidates` section is empty, STOP and tell the user
to run [`find-user-documentation-gaps.md`](../research/find-user-documentation-gaps.md) first — do not fall
back to inventing your own candidate.

State your pick in one sentence: the area ID, its score, the spec file, and the doc
page/`help.md` section (or "no page exists yet").

---

## Step 3 — Research the item

Keep the research **scoped to your backlog item**: the gap description tells you which facts are
missing or wrong and which files hold the ground truth. Your job here is to verify that
description is still accurate (it was written on an earlier date and the app may have moved) and
to gather the exact wording you'll need — not to survey other areas.

Batch your reads: the spec, the existing doc page(s), and the `help.md` rows for the area are
all named in the backlog entry — read them together in one round of tool calls rather than one
file per call.

1. Read the spec file(s) named in the backlog entry in full. Note the exact command syntax,
   flags, and any verbatim error/usage messages — you'll reuse these exactly, not paraphrase
   them. Confirm each fact the backlog entry lists as missing or wrong; if the spec and the app
   disagree, the app is the ground truth (grep the source files named in the entry — read only,
   never edit).
2. **Verify before you publish.** Specs and backlog entries both go stale. Before any command,
   subcommand, flag, key chord, or verbatim message goes into a doc page, confirm it exists in
   the shipped app: a `help.md` row or one `grep -rln '<token>' src/ web/src/` is enough. Grep
   one specific token per call. A fact you cannot confirm in the app does **not** go into the
   docs — drop it and note it in your Step 7 report instead of guessing. Wrong docs are worse
   than missing docs.
3. Read the existing doc page(s) and `help.md` entry named in the backlog entry (if any) and
   confirm, in plain terms, what's wrong: missing / stale / wrong syntax / wrong example /
   doesn't exist yet. If the entry's fact list turns out to be partly stale, work from what you
   verified, not from the entry as written. Also grep the rest of the docs for the area's main
   command or key chord (`grep -riln '<token>' documentation/user-documentation/`) — coverage
   sometimes lives in a page with an unrelated name, and duplicating it creates two pages that
   drift apart; link to it instead.
4. **Check git history for functionality added after the backlog entry was written.** Run one
   command, using the `Last run:` date you noted in Step 2:

   ```bash
   git log --oneline --since="<Last run date>" -- <spec file path> <src file path(s) from the entry>
   ```

   An empty result means the area hasn't moved since the gap was recorded — the entry's fact
   list is current, and you can move on. Otherwise, skim the subject lines for anything that
   sounds like a new flag, a new subcommand, a rename, or removed behavior. For any subject
   that's unclear or looks doc-relevant, run `git show <hash>` to read that one commit before
   writing anything, and fold what you find into your notes — behavior that changed after the
   backlog entry was written is exactly what the entry cannot warn you about.

---

## Step 4 — Write the update

Pick where the content belongs before you write — the backlog entry says where the fix belongs;
follow it unless your Step 3 verification showed it's wrong:

- **New page or existing page?** If a page already covers this area, edit it. If not, add a new
  `.md` file in the `documentation/user-documentation/` subfolder that best matches the topic
  (look at the existing subfolders: `getting-started/`, `command-bar/`, `automation/`,
  `advanced-agents/`, `tab-types/`, `workflows/` — put it where a reader would expect to find it).
  Before creating one, open a neighboring page in that subfolder and match its structure and
  frontmatter (if any) rather than inventing your own.
- **New page? Register it.** Add a sidebar entry for it in `documentation/.vitepress/config.mts`,
  in the section matching its subfolder, at the position where it reads naturally among its
  neighbors. Copy the exact `{ text: ..., link: ... }` shape of the surrounding entries; the
  `link` has no `.md` extension. Touch nothing else in that file. Skip this bullet entirely when
  you only edited existing pages.
- **`help.md` too?** If the command/key binding is new or its description changed, update its row
  in `help.md`'s `Commands` or `Key Bindings` table. Keep it to the existing one-line style — don't
  turn `help.md` into a second copy of the full doc page; link isn't needed there since it's
  in-app, just keep the one-liner accurate.

Follow this checklist while writing (full detail in [`user-documentation.md`](../../guidelines/user-documentation.md)
and [`human-writing-guidelines.md`](../../guidelines/human-writing-guidelines.md) if you want more):

- [ ] First sentence states what the reader can now do — not background or internals.
- [ ] A runnable example/command appears before any explanation of flags or edge cases.
- [ ] No file paths, function/module/class names, or "why we built it this way" engineering
      rationale — that belongs in `product/specs/`, never here.
- [ ] Command names, flags, and error messages are copied **verbatim** from the spec — and only
      after Step 3 point 2 confirmed them against the app.
- [ ] Commands, flags, file paths, and key chords are in `monospace` (`Ctrl+R`, not "control R").
- [ ] Headings are sentence case and describe the task (`Close a page tab`, not `Closing`).
- [ ] Second person, active voice, present tense.
- [ ] Short sentences, one idea each, plain words over fancy ones, no filler phrases ("it's worth
      noting that", "in conclusion").
- [ ] No em dashes, no AI-sounding words (utilize, leverage, delve, robust, seamlessly,
      comprehensive, nuanced, pivotal), no formulaic three-point structure.
- [ ] If a concept is fully explained on another page, link to it instead of repeating it.

Do not touch anything outside the files listed in "Files you may touch".

---

## Step 4b — Add visuals

Every page you created or substantially reworked gets a visuals pass. Two kinds of visuals
exist, with different rules and different guidelines — read both before placing anything:

### Agent character sprites — [`documentation.md`](../../guidelines/documentation.md)

Decorative pixel-art characters floated into the prose. Apply that guideline's rules exactly;
the ones violated most often:

- Count by page length: 1 character under ~30 lines, 2 for ~30–50, 3 over ~50 — never more
  than 3.
- Only the five named characters (malik, yusuf, fariz, hakim, tahir); never the archer or
  idris. Only the `south`, `south-east`, and `south-west` facings.
- Place a sprite only beside flowing prose or a heading — never adjacent to code blocks,
  screenshots, tables, lists, or blockquotes. The tag sits on its own line with blank lines
  around it: `<img class="agent-float" src="/agents/<name>-<facing>.png" alt="" />`.
- Alternate sides on multi-sprite pages (`agent-float` floats right, `agent-float left` left),
  and vary the character from the sidebar-adjacent pages.

When you only made a small edit to an existing page, check the page still satisfies the count
and placement rules after your change (your added text can shift a sprite against a table, or
push the page into a higher length bracket); fix placement if it broke, but don't churn
sprites that already comply.

### Screenshots — "Visuals: use them with intent" in [`user-documentation.md`](../../guidelines/user-documentation.md)

**Default to adding one.** Every page you create or substantially rework that documents visible
UI — a tab type, a picker, a panel, a dialog, a badge, anything a reader has to recognize on
screen — gets a screenshot. Skipping is the exception, reserved for pages about pure command
semantics with nothing visual to show; if you skip, say why in your Step 7 report. A screenshot
is still never decoration and never a substitute for a copyable command.

**How capture works.** `scripts/docs-screenshots.mjs` (run it via
`./scripts/run.mjs docs-screenshots [<name> ...]`; never invoke the file directly) launches the
real app against fixture data — a fresh scratch directory and app process per shot, so captures
are deterministic — drives it with Playwright, and writes each shot to
`documentation/public/screenshots/<name>.png`. The shots are declared in
`scripts/docs-screenshots/manifest.mjs`, one entry per screenshot; the entry `name` is the
output filename, so the doc page's image path stays stable across reruns.

1. Find the element to crop to: `grep -rn 'data-doc-shot' web/src/` and check whether one of the
   existing tags already covers the UI you need. If it does, use that name as `target`.
2. **No existing tag covers it?** Add one, instead of skipping the shot. Open the component file
   for the element (the one already rendering the UI — you're tagging existing markup, never
   building new markup to make a tag for), and add a single `data-doc-shot="<name>"` attribute to
   its outermost JSX element, following the exact style of the attributes found in step 1 (see
   e.g. `web/src/Sidebar.tsx:64` or `web/src/CommandInput.tsx:209`). Pick `<name>` to describe the
   UI region (`kebab-case`, matching the existing naming). This is the **only** change you make in
   that file — no other edit, no matter how small, in the same pass. After adding it, run
   `./scripts/run.mjs check-diff` to confirm lint and typecheck stay clean.
   - If the UI you need to shoot has no element to tag at all — it would require adding new
     markup, not just tagging something already rendered — that is blocked work: ship without the
     screenshot and note it in your Step 7 report.
3. Add a manifest entry, modeled on the existing ones. The fields: `setup` (commands typed into
   the command bar, one at a time; `{{PAGE_URL}}` becomes the fixture web server's URL),
   `actions` (staged input after setup: `{ type }`, `{ press }` in Playwright key syntax,
   `{ wait }` ms), `target` (the `data-doc-shot` attribute to crop to — the one you found or just
   added — or `page` for the whole viewport), plus optional `settle`, `cropToChildren`,
   `clipHeight`, `stabilize`, and `requiresBinary` — the comment block at the top of
   `manifest.mjs` documents each.
4. Capture it: `./scripts/run.mjs docs-screenshots <name>` — and pass, in the same run, the
   name of any existing shot whose page you also edited and whose UI may have moved, so those
   stay fresh too.
   - If it reports the web bundle missing, build it once with `npm run build:web` and re-run
     the capture (a new `data-doc-shot` attribute needs this rebuild to take effect).
   - If it reports Playwright Chromium missing (normal in a sandboxed workspace, where the
     browser download is blocked), or a shot is skipped for a missing `requiresBinary` binary,
     **do not try to install anything** — ship the page without the screenshot. If you added a
     `data-doc-shot` attribute for this shot, keep the attribute (it's harmless, and the next run
     can use it) but drop the manifest entry, and note it in your Step 7 report.
5. Reference it as `![<alt text>](/screenshots/<name>.png)`, placed immediately after the text
   it illustrates. The alt text must convey what the image shows a sighted reader (see the
   existing pages for the style), never a filename or "screenshot of the app".
6. Commit the captured PNG from `documentation/public/screenshots/` along with the manifest
   entry — the pair ships together or not at all.

Never edit anything under `scripts/docs-screenshots/` other than `manifest.mjs`; if a shot
needs capture-code changes beyond a `data-doc-shot` attribute (new fixture data, new Playwright
logic), that is blocked work — ship without the screenshot and note it in the report.

---

## Step 5 — Verify

```bash
npm run docs:build 2>&1
```

1. Must still finish with **no errors**. If it fails and the fix is obviously in the file you just
   edited (typo, bad link, bad frontmatter), fix it and rerun. If you can't get it clean quickly,
   revert your changes (`git checkout -- <files you touched>`, and `rm` any new page you created)
   and report what blocked you.
2. Run `git status` and confirm every changed file is one the "Files you may touch" list allows
   — nothing else should appear yet (the backlog edit comes in Step 6). If anything else
   changed, revert it before moving on. In particular, nothing under
   `documentation/public/agents/` may be staged. If a `web/src/` file changed, `git diff` it and
   confirm the only change is the single `data-doc-shot` attribute you added — revert and drop
   the screenshot if anything else crept in.
3. If you created a new page, confirm its sidebar entry: the `link` value must match the new
   file's path under `documentation/` without the `.md` extension, or the page builds fine but
   never appears in the nav. A dead sidebar link fails the build (caught in point 1); a missing
   sidebar entry fails silently — this manual check is the only thing that catches it.
4. Check every image on the page(s) you touched: each `/screenshots/<name>.png` reference has a
   matching committed file in `documentation/public/screenshots/`, each sprite `src` uses one of
   the five allowed characters and three allowed facings, and the Step 4b count/placement rules
   hold. A missing image does **not** fail the docs build — this manual check is what catches it.
5. Re-read the page(s) you changed once, straight through, as if you'd never seen them. Confirm
   the first sentence states the goal, there's no leftover implementation detail, and every
   command, flag, and key chord on the page is one you verified in Step 3 — if you spot one you
   never confirmed, go back and confirm it now rather than shipping it.

---

## Step 6 — Remove the item from the backlog

Now that the gap is closed and verified, update `product/backlog/user-documentation.md`:

1. Delete the item's bullet from the `candidates` section.
2. Add a one-line bullet for it under the `resolved` section, matching the file's existing
   style: `* <area-id> — documented in <doc page path(s) you touched> (removed <YYYY-MM-DD>)`.
   Get the date from `date -u "+%Y-%m-%d"` — do not write one from memory.
3. Touch nothing else in the file: no rescoring other candidates, no reordering, no editing the
   `Last run` line or the `unverified` section — those belong to
   [`find-user-documentation-gaps.md`](../research/find-user-documentation-gaps.md).

If you skipped the top item because its gap was already closed (Blocked work, case 2), do the
same removal for it, wording the `resolved` bullet as already-resolved instead — then continue
working the candidate you actually took.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Backlog item:     <area-id> (<score>/10)
Source material:  <spec file(s) you read>
Docs touched:     <path(s) of the doc pages / help.md rows / sidebar entries you changed or created>
Gap closed:       <one or two sentences — what was missing or wrong, and what you did about it>
Visuals:          <sprites placed / screenshots added or recaptured / none needed / skipped because <reason>>
DOM tagging:      none / added data-doc-shot="<name>" to <web/src file> for <screenshot name>
Dropped facts:    none / <facts from the backlog entry you could not confirm in the app and left out>
Backlog:          <area-id> removed from candidates<, plus any already-resolved removals>
Docs build:       clean / <errors, if any>
```

Keep it brief. Done.
