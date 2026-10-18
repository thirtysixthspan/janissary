# Scripts tab end-to-end and production build verification
**Complexity: 3/10** — a full check-diff, a production web build with a chunk check, and the source plan's two-project walk, with any defect it finds fixed in the subplan that owns it.

## Goal

Show that the feature works in a running app and in the production bundle. This is the last subplan, and it runs after every code, test, and doc change is in.

## Design decisions and dependencies

This subplan depends on `09-scripts-tab-specs-and-docs`, which depends on everything before it.

- `./scripts/run.mjs check-diff` runs last, scoped to the working tree. The full `npm run check` remains the human's once-at-the-end gate, as `AGENTS.md` says, and this subplan does not run it.
- The production build is `npm run build:web`, which runs Vite with `web/vite.config.ts` and writes to `dist/`. The chunk check finds the chunk that holds the scripts tab by a string that only that code contains, such as `No runscripts yet` or `Used by a system schedule`. It then confirms that the string is not in the entry chunk, and that the entry chunk does not import the scripts entry statically. The plugin checklist and the comment in `web/src/plugins/registry.tsx` both require this check.
- The manual walk follows the source plan's Verification section. In project A, which has two runscripts: `scripts` lists both in alphabetical order. Clone one, and `<name>-2.rs` appears with the same lines and comments and opens in an editor. Execute a runscript, and its lines run in the system shell. Delete a runscript after confirming, and its file is gone. Press `+` twice, and `untitled.rs` and `untitled-2.rs` open. Create a file in `.janissary/scripts` from a terminal, and it appears in the list within about a second. In project B, which has no `.janissary/` directory: `scripts` creates `.janissary/scripts/`, and the tab shows the empty state line.
- The walk also covers what the source plan implies. A runscript used by a system schedule shows the clock marker and the schedule line in the delete dialog. Deleting it leaves the schedule to fire as `missing`. An open editor tab keeps its text after the file is deleted. Saving that tab recreates the file through the editor's existing save path, which the spec states and this walk confirms. After the scripts tab is closed, a runscript created from a terminal does not reach the plugin, and reopening the tab shows the current list. The zero-read rule with no tab open is covered by the unit tests in `03`, because a manual walk cannot observe file reads.
- The walk is run with the `run` skill, which launches the app. Its results are reported in the change description or in the conversation. This subplan does not write a report file.
- After the work is complete, the plan files move from `product/plans/draft/` to `product/plans/ready/` and later to `complete/`, as `AGENTS.md` describes. That move is the owner's call.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Diff-scoped checks | `scripts/run.mjs`, `scripts/check-diff.mjs` (`./scripts/run.mjs check-diff`) | The gate for this subplan. |
| Web build output | `web/vite.config.ts` (`build.outDir`, `dist`) | Source of the chunk check. |
| Production build script | `package.json` (`build:web`) | Runs the production build. |
| Run skill | the `run` skill | Launches the app for the manual walk. |
| Scripted e2e precedent | `scripts/e2e/system-schedules-*.mjs` | A precedent only. Automating the walk is out of scope here. |

## Proposed changes

None, unless the walk finds a defect. A defect is fixed in the subplan that owns the area, with its test. If a fix is a few lines and does not change a contract, it may be made here together with a test that covers it.

## Tests

- `./scripts/run.mjs check-diff` runs the related tests. Confirm that `src/commands.test.ts`, `src/plugins/loaders.test.ts`, `src/plugins/documentation.test.ts`, `src/plugins/api-topics.test.ts`, `src/schedule/manager.test.ts`, `web/src/plugins/registry.test.tsx`, and the scripts tests all pass in that run.
- The walk in the Design decisions section is the end-to-end test.

## Verification

Pass criteria:

- `./scripts/run.mjs check-diff` exits with status 0.
- `npm run build:web` succeeds.
- The scripts tab's strings appear only in a chunk that is not the entry chunk.
- Each manual step produces the result the source plan describes, and the feed and dialog text match the spec word for word.

## Out of scope

- Turning the walk into an automated e2e suite. That could follow the `scripts/e2e` pattern as a separate change.
- The full `npm run check` gate, which is the human's.
- Any new feature work. Anything the walk surfaces that is beyond this feature is logged in `product/backlog/`, not fixed here.
