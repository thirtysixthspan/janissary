<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle filesystem read failures in the local list executor instead of reporting every failure as missing or rejecting.

Existing Issue: In src/file-list/tab-list.ts the lstatSync catch reports every error (including permission denials and symlink loops) as "missing", and a rejection from port.readDirectory on an unreadable directory escapes listFilesInTab as a rejected promise instead of the promised one-word answer. Severity: 4/10

Existing Risk: 5/10 - An unreadable or symlink-loop directory makes the local list command reject or mislabel a path as absent, so the dispatcher that lands in subplan 7 would surface a transport error or a wrong "missing" where the command's vocabulary promises a deliberate refusal.

Proposal Risk: 2/10 - After the change the executor always resolves to a string and the only new code classifies OS error codes; the existing "missing", "notdir", "(empty directory)", and "forbidden" executor tests pin the behavior that must not move.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "handle filesystem read failures in the local file list executor". In src/file-list/tab-list.ts, replace the blanket catch around the lstatSync existence/type check so it distinguishes absence (ENOENT/ENOTDIR => "missing") from access or loop errors (=> "forbidden", the vocabulary's refusal token), and wrap the port.readDirectory call so a rejected directory read resolves to that same one-word string rather than propagating out of listFilesInTab. Keep the existing "notdir when the target is a file", "missing for an absent path", "(empty directory)", and "forbidden for out-of-workspace and secret paths" cases in src/file-list/tab-list.test.ts passing unchanged, and add an executor test that injects a port whose readDirectory throws and asserts a one-word string result. No dispatcher entry exists until subplan 7, so verify through the colocated executor test only.
