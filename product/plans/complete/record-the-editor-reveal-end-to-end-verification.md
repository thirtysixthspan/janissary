# Record the editor reveal's end-to-end verification

**Complexity: 1/10** — 0 added production lines, 0 production files, 5 requirements (p=2.84). The work is a manual walk against the current head plus the written record; it changes no behavior, test, spec, or user documentation.

## Goal

Close the evidence gap in `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab-13-end-to-end-verification.md`. Rerun the reachable manual steps at the current head, append a `## Result` section recording each step's observed outcome, mark the unreachable steps and name their covering tests, and state that the feature was already committed so `check-diff` could not see it. Summarize the result in this plan and remove the resolved pull-request backlog entry.

## Design decisions and dependencies

- The branch head is `960b174ad87a547c023627d9ecc91b105f4f5a6a`; every feature commit is already in the branch. `scripts/changed-files.mjs` builds `check-diff`'s file list from `git diff HEAD` plus untracked files, so the feature cannot appear to the diff-scoped gate. The by-path suites and `npm run docs:build` are the checks that can still be run.
- The walk runs through `ai/tasks/workspace/start-application.md` with the checkout as `<project-dir>` and `./temp/reveal-record/` as the scratch root, because `$root` must be this checkout for steps 1, 5, and 8 and for the `.janissary/workspace` clone path in step 2. One e2e driver holds one browser connection for the whole reachable walk; the app exits on its own when that connection closes.
- The step 2 fixture is a clone-shaped directory under `<checkout>/.janissary/workspace/reveal-check/src/note.md`; a real git clone is unnecessary because the clone rule is lexical. The app's boot cleanup removes clone directories, so the driver creates the fixture after the app is running and before the `edit` command.
- Steps 1, 2, 3, 4, 5, 8, and 10 are reachable in a local-only instance. Steps 6 and 7 need a configured remote host with a workspace, and step 9 needs a GitHub-synced editor; this instance has neither. Those three are recorded as not reached and paired with the tests the subplan names, never marked passed.
- The docs check uses a bounded `npm run docs:dev` on a loopback port, reads the editor page and its file-navigator link, and then tries to stop the dev process. The sandbox denied the signal, so `npm run docs:build` and a source-page read close the check, as the subplan and task allow.
- No feature behavior, test, functional spec, help page, or user documentation changes. The only files written are the completed subplan, this fix plan, and the drained pull-request backlog.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Completed verification subplan | `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab-13-end-to-end-verification.md` | Its walk and pass criteria are the script; the new `## Result` records what ran. |
| Result convention | `product/plans/complete/remote-target-view-and-origin-tab-type.md` | The `## Result` section follows its prose form. |
| Start and stop tasks | `ai/tasks/workspace/start-application.md`, `ai/tasks/workspace/stop-application.md` | Build, start, record, stop, and clear the scratch state. |
| E2E driver | `./scripts/run.mjs e2e-driver`, `scripts/e2e/session.mjs` | One connection, one batch, evidence under the scratch root. |
| Attached browser | `JANISSARY_BROWSER_WS_ENDPOINT`, `JANISSARY_PLAYWRIGHT` | The tab's e2e browser for the walk. |
| Named test suites | The Tests section of the completed subplan | Run by path with one server and one client invocation. |
| Documentation build | `npm run docs:build` | Validates the edited pages and their links. |

## Proposed changes

- Append a `## Result` section to the completed subplan. Record the commit, the committed-feature limitation on `check-diff`, the by-path server and client results, `npm run docs:build`, each reachable step's observed outcome, the three unreached steps with their covering tests, and the absence of notifications.
- Write this fix plan under `product/plans/complete/` with the result summary.
- Remove the resolved entry from `product/backlog/pull-request.md` and restore the exact comment-and-heading skeleton when it is empty.
- Do not edit feature code, tests, specs, help pages, or user documentation.

## Tests

No new tests. Run the suites the completed subplan names by path, one invocation per project:

- Server: `src/file-navigator/reveal-editor.test.ts`, `src/file-navigator/open.test.ts`, `src/tab/view.test.ts`, `src/client-params/file-navigator.test.ts`, `src/message/handler.test.ts`, `src/controller/file/navigator.test.ts`, and `src/commands.test.ts`.
- Client: `web/src/editor/EditorRevealButton.test.tsx`, `web/src/editor/editor-file-commands.test.ts`, `web/src/editor/keys.test.ts`, `web/src/editor/EditorTab.test.tsx`, `web/src/editor/EditorTab.window-keys.test.tsx`, `web/src/theme.test.ts`, `web/src/file-navigator/file/navigator-selection.test.ts`, `web/src/file-navigator/useFileNavigatorSelection.test.ts`, `web/src/file-navigator/FileNavigatorTab.test.tsx`, `web/src/useSidebarSelection.test.ts`, `web/src/Sidebar.test.tsx`, and `web/src/Sidebar.alert-selection.test.tsx`.

The manual walk is the end-to-end test. A test alone never stands in for a reachable step.

## Verification

Run the walk through the start task, using the attached browser and one driver. Record the result of each step, then stop the app through the stop task and remove the scratch root and fixtures. Run `$janissary/scripts/run.mjs check-diff` and record that it sees no changes because the feature is committed. Run the named server and client suites and `npm run docs:build` by path.

## Out of scope

- Changing feature behavior, tests, functional specs, help pages, or user documentation.
- Provisioning a remote host or a GitHub-synced editor to reach steps 6, 7, and 9.
- Turning the walk into an automated browser or e2e suite.
- Running `npm run check`, which is the human's end-of-work gate.

## Result

The reachable walk passed at `960b174ad87a547c023627d9ecc91b105f4f5a6a`. Step 1 opened a fresh left-docked navigator at `$root` with the editor still active; step 2 retargeted it to the clone-shaped fixture with only `src` expanded and `src/note.md` selected; step 3 selected the line end with Ctrl+Shift+E and changed no navigator; step 4 brought a centre-strip navigator forward; step 5 showed the blocked new-file button, enabled it after save, and retargeted the navigator to `$root` with `temp` expanded; step 8 dropped the vanished directory and selected nothing without a notification; step 10 rendered the help row directly after the save row and matched the tooltip. Steps 6, 7, and 9 were not reached and name their covering tests. The by-path suites passed: 7 server files and 330 tests, 12 client files and 430 tests. `npm run docs:build` exited 0; the docs preview served the editor section and its file-navigator link, though the dev process could not be signalled in this sandbox. `check-diff` reported no changes because the feature was already committed. No feature behavior, test, spec, help page, or user documentation changed.