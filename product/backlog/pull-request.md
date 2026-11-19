<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share one set of line-detection predicates for the new exists, head and tail commands instead of three ad-hoc regex copies.

Existing Issue: This change defines local `^file` regexes in both src/acp/tool-table.ts and src/acp/workspace-runner.ts for exists/head/tail while list and stat reuse exported `isFileListCommandLine` and `isFileStatCommandLine`, leaving the same recognition grammar duplicated in three places. Severity: 3/10

Existing Risk: 3/10 - A future alias or spelling change must be found in all three spots, and a missed one silently changes whether a line is extracted, which side runs it, or whether an agent run refuses it.

Proposal Risk: 2/10 - Central predicates keep the currently recognized lines identical and stay pure, so the only residual risk is editing the small shared command modules.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "share line-detection predicates for file exists, head and tail". Add exported `isFileExistsCommandLine` to src/file-exists/command.ts and `isFileHeadTailCommandLine` to src/file-head-tail/command.ts, mirroring the pure case-insensitive `^file\s+(... )(\s|$)` predicates already in src/file-list/command.ts and src/file-stat/command.ts. Replace the local FILE_EXISTS_HEAD_TAIL_LINE regex in src/acp/tool-table.ts and the FILE_EXISTS_LINE and FILE_HEAD_TAIL_LINE regexes in src/acp/workspace-runner.ts with imports of those two predicates, preserving the same recognized lines and the same branch order before the file read fall-through. Keep src/acp/file-primer.ts import-light by importing only from these pure validator modules, never managers. The existing tests in src/acp/tool-table.test.ts and src/acp/workspace-runner.test.ts covering recognized, malformed, and refused lines must continue to pass unchanged.
