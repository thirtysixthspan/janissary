# A task file for regenerating the documentation screenshots

**Complexity: 3/10** — one new playbook under `ai/tasks/`, one test pinning the literals it tells an agent to recognize, and two small corrections to documentation the change makes wrong. No new capture code: `./scripts/run.mjs docs-screenshots` already spins up a janissary per shot, already drives the workspace's attached browser, and already tears both down.

## Goal

There is no task file for regenerating the screenshots. Every other repeatable job in this repo has one — `work-an-issue.md`, `update-documentation.md`, `pull-request-review.md` — and a human who wants the shots refreshed has to remember the build step, the invocation, what a `SKIP` line means, and which files may legitimately change. Give it a playbook: a tab launched with `-b` runs it unattended, the PNGs land in `documentation/public/screenshots/`, and the result ships.

`update-documentation.md` captures screenshots too, but only as one step inside writing a page, and only the shots that page needs. This task is the other half: no prose is written, no manifest entry is added, and the whole manifest is fair game. Keeping them separate is what keeps each one's "files you may touch" list honest.

## Approach

The playbook orchestrates the existing pipeline rather than reimplementing any of it. `scripts/docs-screenshots.mjs` already owns everything the request describes: it creates a scratch directory per shot, spawns the app server into it with a scratch `HOME`, reads the token off the `__JANUS_URL__` line, captures through Playwright, then kills the child and removes the scratch directory. So "spins up janissary, generates screenshots, closes everything down" is one command, and the task's real content is what happens around it — deciding there is a browser to drive, building the bundle first, reading the outcome lines correctly, and shipping only the PNGs.

Modelled on `work-an-issue.md`, because that is the shape the request asked for and the shape an unattended run needs: a one-paragraph job statement, an explicit allowed/forbidden list, numbered steps that stop rather than improvise, and a fixed report shape at the end.

Four decisions worth recording:

**It requires the attached browser and stops without it.** The request named the sandbox's browser specifically, and the pipeline's own fallback — launching a Chromium — cannot work in a workspace anyway, because the sandbox denies reading Playwright's browser cache under `$HOME`. So the task gates on `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` being set and stops with an instruction to relaunch the tab with `-b`, rather than starting a run that will spend a bundle build and then fail on `No browser to drive:`.

**It never closes the attached browser.** That browser belongs to the tab, not to the run. The pipeline is already careful about this (`browser.mjs` closes contexts and lets the connection go with the process), and the playbook says so plainly, because an agent tidying up after itself is exactly how that rule gets broken.

**A skipped shot is a success and a failed shot is not.** `SKIP` means the entry named a binary that is not on `PATH`; the run continues and exits zero, and the right response is to ship what was captured and name the skips in the report. `FAIL` makes the run exit non-zero, and the right response is one retry of just those names — a capture can lose a race on a slow machine — and then reporting them rather than looping.

**It ships whatever the capture rewrote, and says how much.** Screenshots are generated output, so a full run that rewrites every PNG is not a mistake to filter down. The task commits what changed and reports the count, so a human seeing twenty-seven changed files in a PR knows that was the run, not a bug. A run that changed nothing ships nothing — the merge workflow stops on its own when there is no diff.

## Implementation steps

1. **`ai/tasks/take-documentation-screenshots.md`** (new). Sections, in order:

   - Job statement, the no-AI-attribution rule, the run-autonomously rule, and the same command-hygiene note the other tasks carry (run commands plainly; no pipes into `grep`/`tail`, which stall an unattended run).
   - **Allowed**: read anything; run `npm run build:web`; run `./scripts/run.mjs docs-screenshots`; commit the PNGs under `documentation/public/screenshots/`; execute `ai/tasks/workspace/merge-change-to-master.md`.
   - **Forbidden**: editing any file that is not a captured PNG — including `scripts/docs-screenshots/manifest.mjs`, the capture code, doc prose, specs, and source; closing or restarting the attached browser; installing a browser or any other dependency; running `npm run check`; retrying a failed shot more than once; committing when the capture changed nothing.
   - **Step 0** — execute `ai/tasks/workspace/prepare-workspace.md` in full, then confirm a clean tree, so Step 6's ownership check can tell this run's output from what was already there.
   - **Step 1** — confirm both browser variables are set; stop naming `-b` if either is missing.
   - **Step 2** — `npm run build:web`. Captures show the built UI, and a run without `web/dist/index.html` stops with `Web bundle missing — run \`npm run build:web\` first (screenshots capture the built UI).` Building first turns that stop into a non-event.
   - **Step 3** — decide the shot list: every entry by default, or the names passed at invocation. An invocation name that matches no entry fails the run with `No manifest entries match: <names>`, so check the names against `scripts/docs-screenshots/manifest.mjs` first and stop with the mismatch rather than burning a run on it.
   - **Step 4** — capture, and read the outcome. Document the four line shapes the run emits (`Driving …`, `OK <name>`, `SKIP <name> — needs "<binary>" on PATH…`, `FAIL <name>: <reason>`) and the two summaries (`Skipped (binary unavailable): …`, `Failed: …`), with the response to each.
   - **Step 5** — one retry of the failed names only, then stop retrying.
   - **Step 6** — verify: `git status` shows nothing but PNGs under `documentation/public/screenshots/`; revert anything else; confirm no janissary process and no `janus-docs-` scratch directory survived a crashed shot, since the pipeline only removes those on the paths it controls.
   - **Step 7** — ship through `merge-change-to-master.md`, or stop when nothing changed.
   - **Step 8** — report, in a fixed shape: shots requested, captured, skipped, failed, PNGs changed, PR, status.

2. **`scripts/docs-screenshots/task-playbook.test.mjs`** (new) — see Tests. Placed beside the pipeline it pins; `vitest.config.ts` already includes `scripts/**/*.test.mjs` in the `server` project.

Run `./scripts/run.mjs check-diff` after each step.

## Tests

The playbook's load-bearing content is a set of literals copied out of the pipeline: the messages it tells an agent to recognize, the variables it gates on, the directory it says the output lands in, and the commands it says to run. An unattended run decides what to do by matching those strings, so a message reworded in `docs-screenshots.mjs` turns the playbook into confident wrong instructions with nothing failing. `src/plugins/documentation.test.ts` already pins a document this way, for the same reason; this follows its shape.

`scripts/docs-screenshots/task-playbook.test.mjs` reads the playbook and the pipeline sources and asserts:

- every outcome line the playbook quotes — `OK`, `SKIP`, `FAIL`, `Driving`, `Skipped (binary unavailable):`, `Failed:` — is still produced by `docs-screenshots.mjs`
- the bundle-missing message the playbook quotes is still the one the script exits on, verbatim
- the no-matching-entries message the playbook quotes is still the one the script exits on, verbatim
- the `No browser to drive:` prefix the playbook quotes is still the one the script reports an unacquirable browser with
- both environment variables the playbook gates on are the two `browser.mjs` reads
- the output directory the playbook names is the one the script writes to
- the two commands the playbook tells an agent to run — the capture invocation through the script runner, and `npm run build:web` — are a real runner target and a real npm script

## Spec updates

`product/specs/docs-screenshots.md`:

- Add a short section recording that the capture has a task file, that it requires an attached browser rather than falling back to a launch, and that it ships the PNGs and nothing else.
- Correct the stale sentence in *Which browser a run drives*: "Nothing restarts one, so a run that hits it is waiting on a tab relaunched with `-b`." A dead browser is now replaced up to three times per tab (see `harness.md`), so a `connect ECONNREFUSED` is worth one retry before concluding the tab needs relaunching. This sentence was made wrong by the e2e-browser replacement change and is exactly the guidance the new task depends on, so it is corrected here rather than left for someone to trip over.

## Docs

- `documentation/user-documentation/` describes the task picker and the idea of task files, but never enumerates them, so a new task file falsifies nothing there. No change.
- `help.md` has no task rows. No change.
- The comment in `scripts/docs-screenshots/browser.mjs` explaining why `browser.close()` is not called says closing it "closes the *remote* one, the child exits on its server's close event, and the tab is left advertising an endpoint that refuses every later connect". Both halves are now wrong: Playwright's `connect()` turns `close()` into a client-side disconnect that never reaches the browser, and a browser that does die is replaced. The decision it justifies is still right, so the code is unchanged and only the reason is corrected — an inaccurate comment is worse than none, and this one sits directly under the rule the new task repeats.

## Out of scope

- Any change to the capture pipeline, the manifest, or the fixtures. If a shot needs different setup, that is a manifest change, and manifest changes belong to `update-documentation.md`, which owns the page the shot serves.
- Deciding whether a screenshot is still the right screenshot. The task regenerates what is declared; it does not review the manifest.
- Filtering out PNGs whose pixels barely moved. That would need image diffing, and generated output that churns is the accepted cost of regenerating it.
- The host path where no browser is attached. The pipeline still supports it; the task deliberately does not.
