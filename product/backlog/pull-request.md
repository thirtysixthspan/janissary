<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep printed selections bound to the navigator root captured before the client reply.

Existing Issue: `FileNavigatorManager.printView` checks that the navigator state object remains open after waiting for selections but uses its possibly changed root, so an in-place retarget can pair the old tree's selection with a new root. Severity: 4/10

Existing Risk: 4/10 - If the navigator is rerooted or retargeted during the selection request, the printed reusable command can highlight unrelated rows in the new tree.

Proposal Risk: 1/10 - Omitting the selection when the captured navigator's root changes prevents a delayed reply from being applied to a different tree root.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "bind printed selections to the captured navigator root". In `src/file-navigator/manager.ts`, capture the target state's root before awaiting `requestTreeSelections` and use the returned selection only if the same state is still registered under the label and its root still matches the captured root. Add `src/file-navigator/manager.test.ts` coverage that reroots the target or retargets it through `src/file-navigator/open.ts` while selection collection is pending and confirms the printed command omits the stale selection clauses. Preserve the existing tab-reordering and closed-navigator regressions in that test file.


* Preserve profile paths ending in a backslash when those paths do not need quoting.

Existing Issue: `filesCommand` in `src/profile/files.ts` wraps every profile path in double quotes, and the shared token reader treats a backslash before the closing quote as an escape, so a simple path ending in a backslash no longer reaches the navigator unchanged. Severity: 4/10

Existing Risk: 3/10 - A profile containing such a valid path silently opens the wrong target or reports that the target is not a directory instead of restoring its navigator.

Proposal Risk: 1/10 - Leaving safe single-token paths unquoted preserves their prior interpretation while quoted paths continue protecting spaces, quotes, and clause-like targets.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "preserve simple profile paths ending in a backslash". In `src/profile/files.ts`, retain an unquoted form for a single-token path ending in a backslash when the token cannot be consumed as a `files` clause or bare side; keep quoting for paths with whitespace, quotes, or clause-like forms, including the documented limitation for a path that both needs quotes and ends in a backslash. Add cases to `src/profile/files.test.ts` and `src/file-navigator/args.test.ts` showing that a simple trailing-backslash path is emitted and parsed as the exact target, while the existing keyword and escaped-quote profile path cases remain unchanged.
