<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Replace the two `browser`-named modules under `src/database/` with names that say which is the state and which is the service, so a reader can tell them apart without opening both.

Existing Issue: the diff adds `src/database/browser.ts` and `src/database/browser-service.ts`, and the second imports the first, so the pair is distinguishable only by the `-service` suffix and by which one exports the class; `src/database/index.ts` already uses `index.ts` for the command dispatcher, so the suffix convention is new to this tree rather than inherited. Severity: 3/10

Existing Risk: 3/10 - A later change reaches for the wrong one of the two, and the mistake is only visible at the point where a request id or a result list is expected.

Proposal Risk: 1/10 - A rename moves code without changing any of it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: name the two browser modules for what they hold". Rename `src/database/browser.ts` to `src/database/browser-state.ts` and `src/database/browser-service.ts` to `src/database/browser.ts`, so the class's own module is the plainly named one and the state it owns carries the qualifier, matching how the tree already separates a manager from the modules it composes. Update the imports in `src/database/browser-service.ts` — which becomes `src/database/browser.ts` — in `src/database/manager.ts`, and in `src/database/browser.test.ts`, and move `databaseRefs` and `RESULT_LIMIT` to the file that now holds them. No behavior changes and no test changes beyond the import paths; `src/database/browser.test.ts`'s cases must all keep passing against the renamed modules, which is the check that the move was purely mechanical.


* Repair the mangled glyph and broken column alignment in the pull request description's behavior example, so the grid sketch renders as drawn.

Existing Issue: the ASCII grid in the description's Behavior examples section puts a replacement character where one row's delete control belongs — the first data row's cell holds two replacement characters while the second row's holds a single trash glyph — and the two cells are padded to different widths, so the table it sketches does not close on its own right edge. Severity: 2/10

Existing Risk: 2/10 - The sketch is the part of the description a reader uses to picture the layout, and a broken glyph reads as a rendering fault in the feature rather than in the text.

Proposal Risk: 1/10 - The text is only redrawn once and the feature itself is unaffected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: fix the mangled glyph in the description's grid sketch". Edit the Behavior examples section of the pull request description so every row of the ASCII grid carries the same delete-control glyph and every cell in a column is padded to the same width, keeping the box drawing aligned. Change nothing else in the description: the prose, the verification steps, and the files-changed list all match the diff. Verify by reading the rendered description and confirming the grid closes on its right edge.
