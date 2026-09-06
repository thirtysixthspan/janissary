# Capture every documentation screenshot from one janissary instance

**Complexity: 6/10** — the capture pipeline is replaced rather than adjusted: the run loop, the app lifecycle, and the per-shot page all change shape, and a new module has to put a live app back into its launch state between shots. No application source changes, no wire-protocol change, and nothing a user of the app can observe. The risk is not in any one module but in the coupling a shared instance creates, which is what the reset module exists to remove.

Today `scripts/docs-screenshots.mjs` gives every shot its own everything: a scratch directory seeded from the fixtures, a janissary process spawned into it, a browser context, and a page — then kills the process and deletes the directory before the next shot. Twenty-seven shots means twenty-seven app launches, twenty-seven `__JANUS_URL__` handshakes, twenty-seven bundle loads, and twenty-seven `git init`/`git clone` fixture seedings. It is deterministic by brute force, and it spends most of the run's wall clock on startup rather than on capture.

## Goal

`./scripts/run.mjs docs-screenshots` spins up **one** janissary instance, holds it and one browser page open for every shot in the run, and tears both down when the last shot is captured. Each shot still sees a launch-state app and a launch-state working directory, because the run puts them back between shots instead of rebuilding them.

## Design decisions

**One page, held open for the whole run — because the server's life depends on it.** Janissary shuts itself down about a second after its last websocket client disconnects. A run that closed each shot's context before opening the next would leave a window with no clients and race its own server's exit. So the run navigates one page once and drives it for every shot; closing that page at the end is what ends the session, and the process kill that follows is a formality.

**Reset between shots, not a rebuild.** A shared instance couples shots: tabs, transcripts, per-tab command history, schedules, database connections, workspace clones, and files written into the working directory all outlive the shot that made them. The reset returns the app to its launch state — exactly one tab, labelled `janus`, with the root tab's colours and an empty transcript and history — and returns the working directory to the fixture commit. It runs before **every** shot, including the first, so a run that captures a subset produces the same bytes for those shots as a full run does.

**The reset recreates the `janus` tab rather than cleaning it.** Clearing a tab's transcript is a command; clearing its command history, its shells, its database connections and its schedules is not. Closing the tab disposes all of it at once (principle 6 — an agent owns its resources and one call releases them), so the reset closes every tab, including the root one, and makes a new `janus`.

**The new `janus` is made by `profile launch`, because that is the only creation path that sets a tab's colours.** `placeAgent` assigns a new agent tab's dot colour with `distinctColor(<colours already in use>)`, so an `agent janus` typed while any other tab exists can never land on the root tab's `#5b9cff` — it comes back `#00d2d3`, and the tab strip is photographed by five of the shots. A profile entry carries `color`, `group` and `groupColor` as presentation, which `placeAgent` uses verbatim. The reset writes a one-entry profile into the scratch's `profiles/` directory, launches it, and lets the working-directory restore delete the file again — so it exists only between shots and never appears in a screenshot.

**The reset needs one throwaway tab, and pollutes only that one.** The label `janus` is not free until the old tab is closed, and closing it needs somewhere else to type from. So: create `resetting`, close everything else, launch the profile, close `resetting`. Every command the reset types goes into a tab it is about to close, so the `janus` the shot stages in has never had a command typed in it.

**Tabs are closed by clicking their close button, not by typing `close`.** `TabItem` renders a `.tab-close` button on every tab in every strip — centre, sidebar, and reporting. A click leaves no transcript line and no history entry, which is the whole point: a shot that photographs the history picker must see its own three commands and nothing the harness did. A close that raises the unsaved-changes dialog (the editor shot types without saving) is answered `Don't Save`.

**The working directory is restored by the runner, not through the app.** The scratch work directory is already a git repository holding a commit of the fixtures, so `git checkout -- .` plus `git clean -fd -e .janissary` puts it back. `.janissary` is excluded because the live app is using it — its lock, log, state, database files and workspace clones all live there, and the run has no business deleting them out from under a process it wants to keep.

**Teardown is explicit and ordered.** Close the page, then the janissary process, then release the browser, then the fixture page server, then the scratch directory. For a browser this run launched, release closes it. For the browser janissary attached to the tab, release drops the connection and nothing more: closing it would close the browser at the far end and leave the tab advertising an endpoint that refuses every later connect. That distinction is already why `browser.mjs` hands back a `release()` instead of the raw browser, and it does not change here.

**What the shared instance still carries across shots.** The server's global command history — the homedir-scoped list that feeds ghost-text completion — is in-memory and has no reset. A shot's ghost text therefore completes against every command the run has typed so far, not just its own. Today's `ghost-text` shot is unaffected (the only global entry matching `shell git` is its own `shell git status`), but it is the one coupling the reset cannot remove, and it belongs in the spec rather than in a comment.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The shot manifest and its entry vocabulary | `scripts/docs-screenshots/manifest.mjs` (unchanged) |
| Which browser a run drives, and the connect retry | `scripts/docs-screenshots/browser.mjs` |
| App spawn and the `__JANUS_URL__` handshake | `scripts/docs-screenshots/janus.mjs` |
| Scratch seeding, the fixture git repo, the fixture page server | `scripts/docs-screenshots/scratch.mjs` |
| Element clipping, staged actions, the busy-dot stabilizer | `scripts/docs-screenshots/capture.mjs` |
| The close button on every tab, in every strip | `web/src/TabItem.tsx`'s `.tab-close` |
| The unsaved-changes dialog and its `Don't Save` action | `web/src/SaveChangesDialog/SaveChangesDialog.tsx` |

## Implementation steps

1. **`scripts/docs-screenshots/scratch.mjs`: one scratch, restorable.** Keep `createScratch`, `destroyScratch` and `startPageServer` as they are. Add `restoreWorkDirectory(scratch)`, which runs `git checkout -- .` and `git clean -fd -e .janissary` in the work directory through the same `git()` helper the seeding uses.

2. **New module `scripts/docs-screenshots/session.mjs`.** Owns the run's live pieces: `openSession({ repoRoot, scratch, browser })` spawns janissary, waits for its URL, opens one context at the capture viewport and scale, navigates one page to that URL, waits for the command bar, and returns `{ page, close }`. `close()` closes the context and then the process, in that order — the page is the client whose departure the server is waiting for.

3. **New module `scripts/docs-screenshots/reset.mjs`.** Exports `resetProfile()` — the one-entry profile object, with the root tab's `#5b9cff` for both `color` and `groupColor` — and `resetApp(page, scratch)`, which:
   1. presses `Escape` twice and empties the command bar, dismissing whatever overlay or half-typed command the last shot left;
   2. focuses a centre tab that has a command bar (stepping through the strip, because the last shot may have left an editor or an image tab active);
   3. types `agent resetting`, then closes every tab that is not the active one — sidebar and reporting tabs included;
   4. writes the reset profile into `<work>/profiles/`, types `profile launch <name>`, and closes every tab that is not the active one again, leaving the new `janus` alone;
   5. calls `restoreWorkDirectory`, which removes the profile file along with everything else a shot wrote.

   Closing a tab answers the unsaved-changes dialog with `Don't Save` when it appears.

4. **`scripts/docs-screenshots/capture.mjs`: drive the shared page.** `captureShot(page, entry, outputPath)` loses the context creation, the navigation and the `finally { context.close() }` — those move to `session.mjs` and happen once. Everything else (setup commands, staged actions, the settle waits, `stabilize`, `elementClip`) stays exactly as it is.

5. **`scripts/docs-screenshots.mjs`: one instance, one loop.** Create the scratch and the page server once, acquire the browser, open the session, and then for each entry: reset, capture, report. The binary-skip check, the `OK`/`SKIP`/`FAIL` lines, the failure list and the exit code all keep their current wording — `ai/tasks/take-documentation-screenshots.md` reads them. Teardown runs in a `finally`: session, browser release, page server, scratch.

6. **`scripts/docs-screenshots/janus.mjs`: unchanged.** It already spawns one process and kills one process; the run just stops calling it twenty-seven times.

## Tests

`scripts/docs-screenshots/reset.test.mjs` — new file, vitest, matching `browser.test.mjs`'s style (plain `describe`/`it`/`expect` with hand-rolled fakes, no helper framework):

- `resetProfile` declares exactly one agent entry, named `janus`, carrying the root tab's `#5b9cff` as both its dot colour and its group colour, and focused.
- `resetApp` types `agent resetting` before it closes anything, so the tab it types into is one it is about to close.
- `resetApp` closes every non-active tab in both passes, and stops when only the active tab is left.
- `resetApp` answers the unsaved-changes dialog with `Don't Save` when closing a tab raises one.
- `resetApp` writes the profile before launching it and restores the working directory after, so the file never outlives the reset.
- `resetApp` leaves the command bar empty and dismisses an open overlay before it does anything else.

`scripts/docs-screenshots/task-playbook.test.mjs` — the pinned literals stay pinned; the assertions that name modules move with the code they name (the "Driving" source phrase is still composed in `browser.mjs`, the outcome lines are still printed by the runner).

The end-to-end verification is the run itself: `./scripts/run.mjs docs-screenshots` against the workspace's attached browser, capturing every shot from one instance. `app-overview.png` is the one that proves the reset is faithful — it photographs the whole window, so a recreated `janus` that differs from the root tab in colour, label or transcript shows up there.

## What shipped, and what the run proved

Everything above shipped. Two things were learned by running it, and are in the code because of that:

**A busy tab queues what is typed into it.** The first attempt typed `agent resetting` into whichever tab was active, and the reset after `tabs-overview` timed out: that shot starts a 30-second `sleep`, and the tab running it swallows every later command into its queue rather than running one. So the reset now closes every tab the shot left *before* it types anything, and picks its one survivor for being idle as well as for having a command bar — a busy tab is kept only as a fallback to wait on. The same run also showed that `tabs-overview` has been photographing two tabs rather than three for the same reason, which is a manifest defect and out of scope here.

**The right pane needs closing outright.** `:not(.active)` spares one tab per strip, and a split centre area has two strips with an active tab each. The closable set names `.center-strip-right .tab` without the exclusion, so the left pane's active tab is the only survivor.

**What the run proved.** `app-overview` and `tabs-overview` were captured through the new pipeline and came out byte-comparable to the committed images — and `app-overview` is the one that matters, because it was taken *after* a reset: the recreated `janus` tab carries the same blue dot, the same group border, the same `$root/` header and the same empty transcript as the root tab it replaced. That is the profile-launch reset working as designed.

**What it did not prove.** The tab's attached browser died before the fixed reset could be exercised, and nothing restarts one — every connect since returns `connect ECONNREFUSED` on the endpoint the tab still advertises, and the sandbox denies launching a Chromium of its own. So the busy-tab fix, the shots past the third, and a full twenty-seven-shot run are unverified. The next run in a tab with a live browser is what closes that.

## Spec and documentation

- `product/specs/docs-screenshots.md` — the "Capture" section's per-shot instance paragraph is replaced by the single-instance model, the reset between shots, and the one coupling the reset does not remove (global command history).
- `ai/tasks/take-documentation-screenshots.md` — Step 4 tells the agent the pipeline "gives every shot its own scratch directory and its own app process". It says one instance now, and its promise that a shot depends on nothing an earlier one did becomes a promise about the reset.
- `documentation/developer-documentation/documentation.md` — one sentence on the single instance, alongside the existing note about which browser a run drives.

## Out of scope

- **New or changed manifest entries.** Every shot is captured exactly as declared today.
- **`profiles/demo.json`.** The `tabs-groups` and `profile-group` shots launch a profile the fixtures do not contain — `profiles/demo/` is a directory, and profile lookup wants `profiles/demo.json` — so both currently photograph a launch that opened nothing. That is a manifest/fixture defect, it predates this change, and declaring what a shot sets up belongs to `ai/tasks/update-documentation.md`. Reported, not fixed.
- **Regenerating and committing the PNGs.** This change is the pipeline. A capture run proves it works; which images ship is the screenshot task's call.
- **The global command history coupling.** Documented, not removed — removing it needs a server-side reset the app does not have and this change should not invent.
- **`demo.png`.** The homepage hero is not a manifest shot and is not regenerated.
