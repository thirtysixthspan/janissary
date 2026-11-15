<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bring the stale completion doc comments up to date with the new `file grep` route.

Existing Issue: The comment above `completeFileReadCommand` in `src/completion/file-read.ts` still says the function completes `file read` and `file glob` and that `root` is the directory those two resolve against, and the `completeCommandLine` JSDoc in `src/completion/index.ts` still lists only those two file routes, so both comments omit the grep delegation this commit adds. Severity: 2/10

Existing Risk: 2/10 - A maintainer reading either comment to learn the completion surface misses grep and can route a later completion change to the wrong module or duplicate the grep branch, though the consequence is confined to orientation and would be caught in review rather than at runtime.

Proposal Risk: 1/10 - The work is documentation only, so the only hazard is new wording that misdescribes the routing, which no test exercises and only a careful read would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "update the completion doc comments for the file grep route". Extend the comment above `completeFileReadCommand` in `src/completion/file-read.ts` so it names `file grep` alongside `file read` and `file glob` and describes `root` as the directory all three resolve against; in `src/completion/index.ts`, add a `file grep` bullet beside the `file read` and `file glob` bullets of the `completeCommandLine` JSDoc, stating that the seven lowercase flags and `--path` file or directory names complete against `fileReadRoot` before the pattern, that include/exclude/limit values and the pattern or terminator state offer nothing, and that an undefined root offers no paths. Change only those comments — no routing, signature, or behavior — and keep `src/completion/file-grep.test.ts`, `src/completion/file-read.test.ts`, and `src/completion/index.test.ts` passing untouched; no existing test pins either comment, so verify by reading both against `completeFileGrepArgument` and `completeFileReadCommand` after the edit.
