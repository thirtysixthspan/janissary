<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Secure local file list and file stat so a workspace symlink cannot expose paths outside the root.

Existing Issue: The two local cores check only the lexical path before asking the filesystem port for entries and stats, while file exists, file read, file head, and file tail all resolve the target's real path, so a symlink inside the workspace pointing outside is listed or statted. Severity: 7/10

Existing Risk: 6/10 - A user or ACP agent can read file names, sizes, mtimes, and permission bits from outside the workspace through an ordinary symlink, breaching the read-only root rule the other file commands enforce.

Proposal Risk: 2/10 - Both commands resolve the target and check it against the workspace and secret anchors before any listing or stat, matching the far side's physical containment gate; only the added stat calls remain.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "enforce real-path containment in local file list and file stat". In src/file-list/list-core.ts, after checkLexicalPath resolve the requested directory with the canonicalPath plus checkRealTarget pattern used by resolveRealTarget in src/file-exists/exists-core.ts and answer forbidden when it resolves outside the root or to a secret location; apply the same real-target check to each listed entry before rendering its row, so an entry that is an escaping symlink is filtered or refused rather than described. In src/file-stat/stat-core.ts, run the same containment check on the requested path before calling port.statRows. The far-side descriptors already pass through physicallyContainedPath in src/remote/filesystem/refusal.ts, so keep the wording identical to that path. Add local symlink-escape cases to src/file-list/tab-list.test.ts and src/file-stat/tab-stat.test.ts mirroring the escaping-symlink cases in src/file-exists/tab-exists.test.ts (a symlink to an outside directory, one to an outside file, and one to a home secret path), and keep the existing local-versus-remote parity assertions passing.


* Correct the description's claim that remote out-of-workspace answers match the local one-word forbidden.

Existing Issue: The description and plan promise the same one-word forbidden for a path outside the workspace with no path echoed, but the new helpers in src/file-navigator/remote/port-reads.ts short-circuit absolute paths to Outside the workspace: <path>. and a far-side containment refusal is mapped by rejectionLine in src/file-read/tab-read.ts to that same verbose echoed line. Severity: 6/10

Existing Risk: 5/10 - A remote tab prints a verbose line naming the path where a local tab prints forbidden, so callers parsing the documented one-word answers break and the path is echoed in a reply the description says never echoes it.

Proposal Risk: 2/10 - The three one-word commands answer forbidden on both sides while the verbose head and tail lines stay untouched as their spec requires, so the only change is the refusal wording those three commands already document.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "make remote out-of-workspace refusals match the one-word forbidden". In src/file-navigator/remote/port-reads.ts change remoteListDirectory, remoteStatPath, and remotePathExists to return the one-word forbidden from src/file-failure.ts when the path is absolute instead of an echoed Outside the workspace line; leave remoteHeadLines and remoteTailLines on the verbose wording because file head and file tail deliberately keep file read's error lines. Translate a far-side containment refusal for those three operations to forbidden as well, either in the three tab executors or around withRemoteTabPort, without changing rejectionLine for head and tail. Update the remote-tab sections of src/file-exists/tab-exists.test.ts, src/file-list/tab-list.test.ts, and src/file-stat/tab-stat.test.ts, which currently assert the verbose echoed line, to assert forbidden, add an explicit local-versus-remote comparison for an absolute path and a ../ path, and exercise the real far-side refusal path through src/remote/serve-file-navigator.ts rather than only mocked replies. Keep product/specs/remote-server.md's identical-wording claim true.


* Deliver the plan's promise that disabling file list also refuses the file ls alias.

Existing Issue: The description and application-commands spec say disabling file list refuses both spellings and that ls is offered or hidden with the file list row, but resolveApplicationCommand in src/application-commands.ts carries no ls alias on the file list row, so typed dispatch and completion resolve file ls to the parent file builtin instead. Severity: 6/10

Existing Risk: 5/10 - A user who disables only file list can still run and see completion for file ls, so a supposedly disabled command stays reachable from the command bar while the ACP gate, which rewrites the alias through nativeCommandName, correctly refuses it.

Proposal Risk: 2/10 - One alias on the native row makes typed dispatch, completion, and the ACP gate consult the same setting, and no new settings row or grant is introduced, which is the alias shape the plan requires.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "tie the file ls alias to the file list settings row". In src/application-commands.ts give the native file list row the alias ls so resolveApplicationCommand('file ls ...') resolves to file list and disabledApplicationCommand in src/native-commands/policy.ts checks that row's Enabled setting; this also makes completionPolicy in src/completion/command-policy.ts hide ls when file list is disabled and show it when enabled. Update the file list row assertion in src/application-commands.test.ts that currently expects no aliases, and add cases to src/native-commands/policy.test.ts and src/completion/file-read.test.ts proving that disabling file list refuses file ls, hides it from completion, and that disabling the parent file row refuses both spellings. Leave nativeCommandName in src/acp/native-commands.ts as the ACP-side alias so the two routes stay consistent.
