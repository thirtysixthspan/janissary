<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Replace the duplicated 2000-line cap with the shared read cap in head/tail count validation (technical debt).

Existing Issue: The subplan names file read's max-limit constant among the pieces to reuse, but the head/tail parser introduces its own 2000-line cap instead, so the accepted count can drift from what the formatter actually renders. Severity: 3/10

Existing Risk: 3/10 - If file read's cap is lowered later, head and tail keep accepting larger counts that formatFileLines silently clamps, so callers get fewer lines than requested and a continuation footer tail would not otherwise emit.

Proposal Risk: 2/10 - With one shared constant the two limits cannot diverge, though head and tail still depend on file read's formatting staying unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "reuse the shared read cap for head/tail count validation". In src/file-head-tail/command.ts import FILE_READ_MAX_LIMIT from src/file-read/command.ts and derive FILE_HEAD_TAIL_MAX_LINES from it instead of hardcoding 2000, so the parser cannot accept a count that src/file-read/format.ts will silently clamp. Update src/file-head-tail/command.test.ts so its 2000-accepted and 2001-rejected boundary assertions derive from the shared constant rather than a literal, and keep the existing default-10, zero, negative, non-numeric, repeated-flag, and usage-line cases unchanged. Confirm head and tail in src/file-head-tail/tab-head-tail.ts still call readWorkspaceLines and formatFileLines untouched and that the executor tests in src/file-head-tail/tab-head-tail.test.ts still pass.


* Return the one-word directory result for symlinks that point to directories, not just direct directories (functionality gap).

Existing Issue: The directory pre-check uses lstat mode bits, so a symlink to a directory is not detected and the subsequent read emits file read's verbose "Is a directory" line even though the subplan makes the directory case the only one-word result. Severity: 4/10

Existing Risk: 4/10 - A symlinked directory yields a different error shape than a real directory, so a caller branching on the documented one-word result mishandles that path.

Proposal Risk: 2/10 - Both directory forms then share one result, and the extra symlink resolution stays behind the existing lexical and real-target checks in src/file-read/policy.ts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "return the one-word directory result for symlinked directories". In src/file-head-tail/tab-head-tail.ts make the pre-read directory check symlink-aware: keep the fast lstat check through readRowStat, and when the row stat's mode marks a symlink, resolve the target with canonicalPath from src/file-read/canonical.ts, re-run checkLexicalPath against the resolved location, and stat the resolved path for S_IFDIR before returning fileFailureLine("Is a directory", parsed.path) / "notdir". Add an executor case in src/file-head-tail/tab-head-tail.test.ts that creates a symlink to a directory and asserts "notdir" for both head and tail, plus one asserting a symlink to a regular file is still read. Leave the verbose lines for missing, out-of-workspace, non-text, and oversized files, and all parser tests, untouched.
