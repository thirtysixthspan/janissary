<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve profile paths ending in a backslash when those paths do not need quoting.

Existing Issue: `filesCommand` in `src/profile/files.ts` wraps every profile path in double quotes, and the shared token reader treats a backslash before the closing quote as an escape, so a simple path ending in a backslash no longer reaches the navigator unchanged. Severity: 4/10

Existing Risk: 3/10 - A profile containing such a valid path silently opens the wrong target or reports that the target is not a directory instead of restoring its navigator.

Proposal Risk: 1/10 - Leaving safe single-token paths unquoted preserves their prior interpretation while quoted paths continue protecting spaces, quotes, and clause-like targets.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "preserve simple profile paths ending in a backslash". In `src/profile/files.ts`, retain an unquoted form for a single-token path ending in a backslash when the token cannot be consumed as a `files` clause or bare side; keep quoting for paths with whitespace, quotes, or clause-like forms, including the documented limitation for a path that both needs quotes and ends in a backslash. Add cases to `src/profile/files.test.ts` and `src/file-navigator/args.test.ts` showing that a simple trailing-backslash path is emitted and parsed as the exact target, while the existing keyword and escaped-quote profile path cases remain unchanged.
