# Take Documentation Screenshots

Your job: regenerate the screenshots the pages under `documentation/user-documentation/` reference, using the browser janissary attached to this tab, and ship the PNGs. The capture pipeline starts one janissary, holds it and one browser page open for every shot, and tears both down at the end, so this task runs one command and spends the rest of its effort on the decisions around it: confirming there is a browser to drive, building the bundle the captures photograph, reading the run's outcome correctly, and committing the generated images and nothing else. You change files under `documentation/public/screenshots/` and nothing else in the repository.

**Project directory.** Every path in this task refers to the current working directory — the project being worked on — never to the Janissary codebase's own tree, even when this task file was launched from an absolute path inside the Janissary installation.

**This is not the documentation-writing task.** [`update-documentation.md`](update-documentation.md) writes pages and captures the one or two shots a page it wrote needs, adding manifest entries as it goes. This task writes no prose, adds no manifest entry, and regenerates whatever the manifest already declares. If a shot needs different setup, a different crop, or a new entry, that is that task's work, not this one's — report it and leave the manifest alone.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" (or similar) lines or badges, and no AI authorship notes in commit messages or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop for the conditions the steps below name explicitly.

**Command hygiene for the whole run.** Run each command plainly and read its output from the tool result. No piping into `grep`/`tail`/`head`, no `>` redirects, no `$(...)` capture — each of those trips a permission prompt or a hook rejection in this repo and stalls an unattended run. The capture prints one line per shot; read them from the result rather than filtering. This overrides CLAUDE.md's "Capturing command output" guidance for this task.

---

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Run `npm run build:web`. Run `$janissary/scripts/run.mjs docs-screenshots`, with or without shot names. Commit the PNGs the capture writes under `documentation/public/screenshots/`. Execute the full merge workflow via [`workspace/merge-change-to-master.md`](workspace/merge-change-to-master.md) when the run produced changed images.

### Forbidden — no exceptions

1. **Editing any file that is not a captured PNG.** Not `scripts/docs-screenshots/manifest.mjs`, not the capture code beside it, not a documentation page, not a spec, not application source. This task regenerates declared shots; changing what is declared belongs to `update-documentation.md`. A change you believe is needed goes in the report, not in the diff.
2. **Hand-editing a PNG.** They are generated output. The only thing that writes them is the capture.
3. **Closing, killing, or restarting the attached browser.** It belongs to this tab, not to this run — see Step 1.
4. **Installing anything.** No browser download, no dependency, no binary to satisfy a skipped shot. A shot that cannot be captured here is reported, not enabled.
5. **Running `npm run check`.** That is the human's end-of-work gate.
6. **Retrying a failed shot more than once.** One retry covers a lost race; a second is a loop.
7. **Committing when the capture changed nothing.** A run that rewrote no bytes has nothing to ship.

---

## Step 0 — Prepare the workspace

Execute [`workspace/prepare-workspace.md`](workspace/prepare-workspace.md) in full, then run `git status` and confirm the tree is clean — no modified and no untracked files. An install can rewrite `package-lock.json`; if it did and you changed no dependencies, revert it with `git checkout -- package-lock.json`.

If the tree still is not clean, **stop and report what is there**. Step 6 decides what to ship by looking at which files changed, and it cannot tell this run's output from someone else's leftovers on a dirty tree.

---

## Step 1 — Confirm there is a browser to drive

This task drives the browser janissary attached to this tab. Confirm both variables are set:

```bash
node -e "console.log(!!process.env.JANISSARY_BROWSER_WS_ENDPOINT, !!process.env.JANISSARY_PLAYWRIGHT)"
```

Both must print `true`. If either is `false`, **stop** and report that the tab needs relaunching with `-b` (`harness <name> -b`, or the **E2E browser** toggle in the New harness dialog). Do not continue on the pipeline's fallback path: it launches a Chromium of its own, and inside a workspace that always fails, because the sandbox denies reading Playwright's browser cache under `$HOME`. Starting the run anyway spends a bundle build to arrive at `No browser to drive:` several minutes later.

**Never close that browser.** The endpoint is a client connection to janissary's own browser server, and this run is a guest on it. The capture closes the one context it opened and lets the connection go when the process exits, which is the whole of the cleanup it owes. Tidying up further would take the tab's browser with it.

---

## Step 2 — Build the web bundle

```bash
npm run build:web
```

Captures photograph the built UI, not a dev server. A run with no `web/dist/index.html` stops with:

```
Web bundle missing — run `npm run build:web` first (screenshots capture the built UI).
```

Building first makes that a non-event, and it also guarantees the shots show the working tree's UI rather than whatever was built last.

If the build fails, **stop and report the failure**. Do not try to fix it — this task does not edit source.

---

## Step 3 — Decide which shots to capture

With no names in the invocation, capture every shot in the manifest. With names — `execute ./ai/tasks/take-documentation-screenshots.md tabs-overview shell-output` — capture only those.

When names were given, read `scripts/docs-screenshots/manifest.mjs` and confirm each one matches an entry's `name`. A name that matches nothing fails the whole run with `No manifest entries match: <names>`, capturing nothing — so check first and **stop, naming the mismatch and listing the entry names that do exist**, rather than spending a run to learn it.

---

## Step 4 — Capture

```bash
$janissary/scripts/run.mjs docs-screenshots
```

Append the shot names when Step 3 chose a subset. The pipeline sets the run up once and keeps it: it seeds one scratch directory from the fixtures, makes it a git repository with a local `origin` so workspaced shots can clone, points `HOME` at a scratch directory so the app's homedir state never touches the real one, starts a fixture web server for the shots that need a page, launches one janissary into that directory, and drives every shot through one browser page. Between shots it puts the app back into its launch state — one `janus` tab, empty — and the working directory back to the fixture commit. At the end it closes the page, kills the app, lets the browser go, and removes the directory. You do not start or stop janissary yourself, and you do not clean up after a shot.

The run reports itself in lines you must read:

| Line | What it means | What you do |
| --- | --- | --- |
| `Driving attached janissary browser at <endpoint>` | It connected to this tab's browser | Nothing. This is the line Step 1 was for. If it instead says it is driving a locally launched Chromium, stop — Step 1's check has been bypassed and the shots will not be captured under the intended browser. |
| `OK <name>` | Captured | Nothing |
| `SKIP <name> — needs "<binary>" on PATH; capture it manually and commit the PNG.` | The entry declares a binary this machine does not have | Nothing. This is a success. The run continues and exits zero, and the names are listed again at the end after `Skipped (binary unavailable):`. Carry them into the report. |
| `FAIL <name>: <reason>` | That shot did not capture | The rest still run. Collect the names; the run ends non-zero with `Failed: <names>`. Go to Step 5. |

A `No browser to drive: <reason>` stop here means the browser went away between Step 1 and now. `connect ECONNREFUSED` is the usual reason. Janissary replaces a browser that dies, so retry the command once; if the second attempt reports the same thing, **stop** and report that the tab's browser could not be reached.

A `No janissary to drive: <reason>` stop means the app itself never came up — the whole run rests on one instance now, so nothing is captured. The usual reasons are another process holding one of the ports it chose, or a directory lock. Retry the command once; if the second attempt reports the same thing, **stop** and report the reason it gave.

---

## Step 5 — Retry the failures once

If Step 4 reported `Failed: <names>`, run the capture again with exactly those names and nothing else:

```bash
$janissary/scripts/run.mjs docs-screenshots <failed-name> [<failed-name> ...]
```

A capture can lose a race on a loaded machine, and one retry settles that. Whatever fails the second time is **not retried again**: keep the successfully captured PNGs, carry the still-failing names into the report, and continue to Step 6. A partial regeneration is worth shipping; a retry loop is not.

---

## Step 6 — Verify what changed

```bash
git status --short
```

1. Every changed or added path must be under `documentation/public/screenshots/` and end in `.png`. Anything else is not this run's output — revert a tracked file with `git checkout -- <path>` and remove an untracked one with `git clean -f -- <path>` before going on. Nothing under `documentation/public/agents/` may appear; that directory is gitignored build output.
2. Count the changed PNGs and note it for the report. A full run rewriting most of them is ordinary — they are generated images and small rendering differences are expected — and saying the number is what tells a reviewer the diff size was the run rather than a bug.
3. Confirm the run's scratch directory did not survive it. The pipeline removes it in a `finally`, so a leftover means the run itself was killed part-way:

   ```bash
   node -e "const {readdirSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),p=require('node:path');const t=tmpdir();const l=readdirSync(t).filter(n=>n.startsWith('janus-docs-'));for(const n of l)rmSync(p.join(t,n),{recursive:true,force:true});console.log('removed',l.length,'leftover scratch directories')"
   ```

   A run killed mid-shot can also leave the janissary process behind. This task does not go looking for one: process inspection is not pre-approved in this repo, so the command would sit waiting on an approval that an unattended run never gets. If you killed a capture yourself, say so in the report and let the human clear it.
4. If no PNG changed at all, there is nothing to ship. Skip Step 7 and report the run as a no-op.

---

## Step 7 — Ship the images

Execute [`workspace/merge-change-to-master.md`](workspace/merge-change-to-master.md) in full. That document owns the merge workflow — follow its steps without deviation.

Use a Conventional Commits subject of type `docs` naming the capture, and a body that says which shots were regenerated, which were skipped and why, and which failed. Example subject: `docs(screenshots): regenerate documentation screenshots`.

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Browser:        attached (<endpoint host:port>)
Shots:          all | <names requested>
Captured:       <count> OK
Skipped:        none | <names> (<binary> not on PATH)
Failed:         none | <names> (after one retry)
Images changed: <count> PNG(s) under documentation/public/screenshots/
Noted:          none | <manifest or page problems you saw and did not fix>
PR:             <url> (#<number>) | none — no images changed
Status:         merged | no changes to ship | stopped: <reason>
```

Keep it brief. Done.
