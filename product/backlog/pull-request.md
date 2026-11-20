<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's row examples to show the millisecond precision the formatter actually emits.

Existing Issue: The description's `file list`, `ls`, and `file stat` behavior examples and the `help/file.md` reference row show an mtime like `2026-11-19T13:50:00Z`, but `formatFileRow` renders dates with `new Date(stat.modified).toISOString()`, which always includes milliseconds, and the row tests pin `2026-11-19T13:50:00.000Z`. Severity: 2/10

Existing Risk: 2/10 - A reader treating the published example as the output contract will mis-compare or mis-parse real rows, and the same wrong shape gets copied into future docs because nothing in the diff contradicts it.

Proposal Risk: 1/10 - The examples then agree with the formatter and its tests; the only remaining hazard is that a future change to `formatFileRow` would need these examples updated again, which a pinned row test would flag.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "correct the row examples to show ISO milliseconds". In the pull request body's Behavior examples, change each `2026-11-19T13:50:00Z` mtime to `2026-11-19T13:50:00.000Z` in the two `file list`/`file ls` blocks and the `file stat notes.txt` block, and make the "How to verify" step 1 expectation say the ISO-UTC mtime carries milliseconds. In `help/file.md`'s "Listing and inspecting paths" section, change the example row `file -rw-r--r-- 1234 2026-11-19T13:50:00Z notes.md` to `file -rw-r--r-- 1234 2026-11-19T13:50:00.000Z notes.md`. Apply the description change with `gh pr edit --body-file` as the work task prescribes, preserving every other paragraph verbatim and leaving change-set statistics out of the corrected paragraphs; do not touch the title. Do not change `src/file-row.ts`: its `toISOString()` choice is the plan's explicit design decision and is correct. The row-shape assertions in `src/file-row.test.ts`, `src/file-list/tab-list.test.ts`, `src/file-stat/tab-stat.test.ts`, and `src/remote/filesystem/stat-path-operation.test.ts` already pin the `.000Z` spelling and must keep passing untouched; after the doc edits, re-read the changed examples to confirm they match those assertions word for word.
