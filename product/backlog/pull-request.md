<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add a walker test where the start directory is below the root and the ignored set names a nested path, so the ignored lookup is pinned to root-relative paths.

Existing Issue: Every walker test that passes a non-empty ignored set starts at the root, where root-relative and start-relative paths are identical, so isPruned in the walker could be handed the start-relative path instead of the root-relative one and every test would still pass. Severity: 3/10

Existing Risk: 4/10 - Once subplan 4 wires in --path, a swapped argument would make ignored files under a narrowed search directory reappear (or unrelated start-relative names be pruned), and nothing would catch it before users saw build output and other git-ignored files listed.

Proposal Risk: 1/10 - The test fixes the expected path space for ignored lookups; if it were wrong, it would fail on the current implementation, which already uses the root-relative path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "pin the glob walker's ignored-set lookup to root-relative paths when start is below root". In src/file-glob/walk.test.ts add a test that writes src/gen/out.ts, src/keep.ts, and gen/out.ts under the temp root, calls the walk helper with start path.join(root, 'src'), pattern '**/*', and ignored new Set(['src/gen']), and asserts paths equals ['src/keep.ts']; then repeat with ignored new Set(['gen']) and assert paths equals ['src/gen/out.ts', 'src/keep.ts'], which proves a start-relative name is not treated as ignored. Do not change src/file-glob/walk.ts, whose walkDirectory already passes the root-relative path to isPruned. Existing tests in walk.test.ts, including "prunes ignored files and directories by exact path without visiting them" and "lists the contents of a start directory that is a dot-directory or ignored", must keep passing unchanged. Verify with $janissary/scripts/run.mjs check-diff.
