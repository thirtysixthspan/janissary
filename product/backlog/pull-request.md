<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add a walker test that pins early stopping at the limit, so a regression to walking the whole tree and slicing afterwards fails a test.

Existing Issue: The walker's two limit tests only assert the returned paths and the truncated flag, which a walk that read every directory and sliced its result at the end would produce identically, so the plan's core reason for a custom walker (stop reading once limit + 1 matches are held) is not pinned by any test. Severity: 4/10

Existing Risk: 4/10 - A later refactor, such as piece 2 extending the classify and record helpers or a move to parallel reads, could drop the stop check and silently make every truncated search walk the full tree, which shows up only as slowness on large repositories.

Proposal Risk: 2/10 - The test pins that no further directory is read once the walk stops, though a mock of the filesystem module can drift from the real readdir signature and would then need updating alongside it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "pin the glob walker's early stop at limit + 1 with a test". In src/file-glob/walk.test.ts add a test that proves walkGlob stops reading once it holds limit + 1 matches: wrap readdir from node:fs/promises with a vi.mock factory that delegates to the real implementation (via importOriginal) and records each directory it is called with, then build files a, b, c/x and d/y under the temp root, call walkGlob with limit 1, and assert the result is paths ['a'] with truncated true and that the recorded calls contain only the root directory (neither c nor d was read). If module mocking interferes with the other tests in the file, put the new test in its own file such as src/file-glob/walk-stop.test.ts. Do not change src/file-glob/walk.ts; the existing limit tests in walk.test.ts ("truncates at limit + 1 matches" and "does not truncate at exactly limit matches") must keep passing unchanged. Verify with $janissary/scripts/run.mjs check-diff.


* Add a walker test where the start directory is below the root and the ignored set names a nested path, so the ignored lookup is pinned to root-relative paths.

Existing Issue: Every walker test that passes a non-empty ignored set starts at the root, where root-relative and start-relative paths are identical, so isPruned in the walker could be handed the start-relative path instead of the root-relative one and every test would still pass. Severity: 3/10

Existing Risk: 4/10 - Once subplan 4 wires in --path, a swapped argument would make ignored files under a narrowed search directory reappear (or unrelated start-relative names be pruned), and nothing would catch it before users saw build output and other git-ignored files listed.

Proposal Risk: 1/10 - The test fixes the expected path space for ignored lookups; if it were wrong, it would fail on the current implementation, which already uses the root-relative path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "pin the glob walker's ignored-set lookup to root-relative paths when start is below root". In src/file-glob/walk.test.ts add a test that writes src/gen/out.ts, src/keep.ts, and gen/out.ts under the temp root, calls the walk helper with start path.join(root, 'src'), pattern '**/*', and ignored new Set(['src/gen']), and asserts paths equals ['src/keep.ts']; then repeat with ignored new Set(['gen']) and assert paths equals ['src/gen/out.ts', 'src/keep.ts'], which proves a start-relative name is not treated as ignored. Do not change src/file-glob/walk.ts, whose walkDirectory already passes the root-relative path to isPruned. Existing tests in walk.test.ts, including "prunes ignored files and directories by exact path without visiting them" and "lists the contents of a start directory that is a dot-directory or ignored", must keep passing unchanged. Verify with $janissary/scripts/run.mjs check-diff.
