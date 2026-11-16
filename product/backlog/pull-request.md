<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle large valid hunks without exceeding the JavaScript argument limit.

Existing Issue: Applying a replacement spreads every inserted line into one splice call, so a sufficiently large hunk throws a RangeError instead of returning a result. Severity: 6/10

Existing Risk: 6/10 - A patch well within the planned size limit can fail unexpectedly when it contains many short lines, interrupting the command instead of applying or reporting a normal failure.

Proposal Risk: 2/10 - Large replacements could still expose performance limits, but bounded construction avoids the engine's argument-count limit and regression coverage checks the resulting content.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "handle large valid hunks without exceeding the JavaScript argument limit". Change replacement assembly in src/file-patch/hunks.ts to build the result without spreading an unbounded number of lines into a function call, while preserving original-line positions and same-position insertion order. Add a regression case in src/file-patch/hunks.test.ts with a valid hunk containing enough short added lines to exceed typical argument limits while remaining under the patch size limit; verify the complete output and run the diff-scoped checks.
