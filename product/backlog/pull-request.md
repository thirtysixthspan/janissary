<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the advertised file ls alias that role sessions currently drop instead of running.

Existing Issue: The new list primer calls `file ls` an accepted alias and the file tool's reply predicate recognizes it, but reply extraction still requires a native name and no native name exists for the alias, so a role agent ending its reply with `file ls docs` has the command silently ignored. Severity: 6/10

Existing Risk: 5/10 - A role agent follows the primer's own alias hint, the listing never runs, and the user gets only an ordinary reply with no result and no refusal explaining why.

Proposal Risk: 2/10 - Resolving the alias to the existing `file list` native name reuses its settings row and its workspace runner path, so no new command surface or execution branch is introduced.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "make the file ls alias execute in role-session reply extraction". In src/acp/native-commands.ts, teach nativeCommandName to map the `file ls` spelling to the existing `file list` native name before returning, leaving NATIVE_ACP_COMMANDS and the application-command inventory untouched so no `file ls` settings row appears. That single change lets toolExtractor in src/acp/tool-table.ts (which requires nativeCommandName(line) before checking isCommandLine) and gateCoreCommand (which throws on an unknown native name) accept the alias, while the file tool's isCommandLine predicate already recognizes it and src/acp/workspace-runner.ts already parses and runs it through parseFileList. Add a test in src/acp/tool-table.test.ts asserting that toolExtractor on a reply ending in `file ls docs` returns that line and that gateCommand with a core snapshot granting `file list` returns runsOn workspace with no refusal, plus a test in src/acp/native-commands.test.ts asserting nativeCommandName(`file ls docs`) is `file list`. Keep the no-`file ls`-row assertion in src/application-commands.test.ts passing. If the alias is meant to be typed-only instead, remove the alias sentence from the primer in src/acp/file-primer.ts and the reply-predicate alias test rather than leaving the primer advertising behavior the ACP loop cannot perform.


* Share one set of line-detection predicates for the new exists, head and tail commands instead of three ad-hoc regex copies.

Existing Issue: This change defines local `^file` regexes in both src/acp/tool-table.ts and src/acp/workspace-runner.ts for exists/head/tail while list and stat reuse exported `isFileListCommandLine` and `isFileStatCommandLine`, leaving the same recognition grammar duplicated in three places. Severity: 3/10

Existing Risk: 3/10 - A future alias or spelling change must be found in all three spots, and a missed one silently changes whether a line is extracted, which side runs it, or whether an agent run refuses it.

Proposal Risk: 2/10 - Central predicates keep the currently recognized lines identical and stay pure, so the only residual risk is editing the small shared command modules.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "share line-detection predicates for file exists, head and tail". Add exported `isFileExistsCommandLine` to src/file-exists/command.ts and `isFileHeadTailCommandLine` to src/file-head-tail/command.ts, mirroring the pure case-insensitive `^file\s+(... )(\s|$)` predicates already in src/file-list/command.ts and src/file-stat/command.ts. Replace the local FILE_EXISTS_HEAD_TAIL_LINE regex in src/acp/tool-table.ts and the FILE_EXISTS_LINE and FILE_HEAD_TAIL_LINE regexes in src/acp/workspace-runner.ts with imports of those two predicates, preserving the same recognized lines and the same branch order before the file read fall-through. Keep src/acp/file-primer.ts import-light by importing only from these pure validator modules, never managers. The existing tests in src/acp/tool-table.test.ts and src/acp/workspace-runner.test.ts covering recognized, malformed, and refused lines must continue to pass unchanged.
