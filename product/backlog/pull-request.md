<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Refuse host-tool writes and edits to the files that define the tool's own authorization and to git's executable hooks, a security gap the containment policy leaves open.

Existing Issue: The write and edit tools contain mutations to the workspace and the secret-path table only, so a `tell` agent on a local tab without a workspace clone, whose root is the launch directory, can rewrite `.janissary/roles.json` and `.janissary/commands.json` (the role grants and command settings that are this feature's only enforcement, read from that same directory) and can write `.git/hooks/*` or `.git/config`, which git later executes outside any sandbox. Severity: 8/10

Existing Risk: 8/10 - A prompt-injected or misbehaving agent can grant the `ask` role mutations, re-enable a command the user disabled, or plant a hook that runs arbitrary code on the user's next commit, defeating the "refusal comes only from grants and command settings" boundary the pull request relies on instead of an approval prompt.

Proposal Risk: 4/10 - The protected list can still miss other self-referential or executable control files, such as a project's harness configuration, and a user who legitimately wanted an agent to edit those files must now do it by hand.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "refuse host-tool writes and edits under the root's .janissary and .git directories". Add a mutation-only protected-path check beside the secret check, for example a `checkProtectedPath(relative)` in `src/file-read/policy.ts` that the reader never calls, refusing any path whose first root-relative segment, compared case-insensitively, is `.janissary` or `.git`, with a new `FilePolicyFailure` word such as `Protected file`. Call it in `src/file-write/target.ts` both on the lexical relative path in `resolveMutationTarget` and on every real path checked by `checkContainedPaths` and `recheckDestination` (relative to `realRoot`), so a symlink inside the root that aliases `.git/hooks` or `.janissary` is refused the same way, and do it before `createTargetParents` creates anything. Because `writeToolTextFile` in `src/file-write/filesystem.ts` and `editToolTextFile` in `src/file-write/edit.ts` both resolve through `target.ts`, this covers typed commands, the local ACP route in `src/acp/run-prompt.ts`, the remote-hosted loop in `src/remote/serve-acp-loop.ts`, and the far side of `write-file` and `edit-file`; `src/file-write/outcome.ts` already prints any other policy word as `<reason>: <path>.`. Add cases to `src/file-write/target.test.ts` (lexical path, symlinked directory alias, nothing created), `src/file-write/filesystem.test.ts`, `src/file-write/edit.test.ts`, and a far-side refusal to `src/remote/serve-file-navigator.test.ts`, and confirm `src/file-read/read.test.ts` is unchanged so reads of these files keep working. Update `help/file.md`, the write and edit sections of `product/specs/acp.md`, and the plan's design decisions to name the protected directories and the reason.


* Give the whole-file write's expected-hash read the same read-time regular-file and post-read size guards the edit helper was hardened with.

Existing Issue: `readExistingText` in the write helper bounds the existing target with `statSync(...).size` and then calls `readFileSync` with no regular-file check at read time and no size check on the bytes read, while `readEditableFile` in the edit helper refuses a target that turned non-regular and rechecks the bytes it read, so the two helpers on the same owning machine apply different guards to the same kind of read. Severity: 4/10

Existing Risk: 4/10 - A target swapped for a named pipe after classification blocks `readFileSync` synchronously, which on a remote host stalls the whole serving process and every channel it serves, and a file grown after the stat is read unbounded into memory, which is exactly the case the edit helper's race test was written to prevent.

Proposal Risk: 2/10 - The stat-to-open window the plan explicitly leaves out of scope remains, but both helpers then share one guarded read and a test pins it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "guard the write helper's expected-hash read like the edit helper's read". In `src/file-write/filesystem.ts`, make `readExistingText` keep its own `statSync` result, refuse `!stats.isFile()` as `Not a text file` before opening, keep the size refusal, read the bytes with `readFileSync(realPath)` and refuse `bytes.byteLength > FILE_POLICY_MAX_BYTES`, then decode as today (lossy UTF-8 with one leading BOM stripped, matching the editor's save-conflict read in `LocalFileSystemPort.writeFile` in `src/file-navigator/filesystem-port.ts`). Preferably extract one bounded regular-file byte read into a small shared module in `src/file-write/` and use it from both `readExistingText` and `readEditableFile` in `src/file-write/edit.ts`, so the guards cannot drift again. Add a `writeToolTextFile` counterpart to `src/file-write/edit-read-race.test.ts` (or a sibling race test using the same `node:fs` mock) showing a target that turns non-regular or grows past 5 MiB after classification is refused with `expectedHash` set, without the file being opened or changed. `src/file-write/filesystem.test.ts` and `src/file-write/edit-read-race.test.ts` must keep passing unchanged.


* Correct the `tell` help page, which still says the default tell role grants ten native commands and omits file write and edit.

Existing Issue: `help/tell.md` states that the default tell role has all ten native commands and lists them ending with `file read`, while `DEFAULT_ROLES` now grants twelve including `file write` and `file edit`, and neither the plan's documentation list nor the diff updated that page. Severity: 4/10

Existing Risk: 4/10 - The help page a user reads before running `tell` hides that the default role can now create and change workspace files without an approval prompt, so a user can hand out write power without knowing it.

Proposal Risk: 1/10 - A wording change; the residual risk is the page drifting again on the next vocabulary change, which a grep for the command count would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "update help/tell.md for the twelve default tell grants". In `help/tell.md`, change the default-grants sentence to say the default tell role has all twelve native commands, add file write and file edit to its list, and add one sentence that an existing roles file is not migrated so a saved tell keeps the grants it lists, matching `product/specs/roles.md` and `documentation/user-documentation/tab-types/roles.md`. Confirm `help/ask.md` still matches the unchanged ask grants. No code changes; any test that snapshots help page content must still pass.


* Bring the remote user documentation in line with the updated specs, which now say remote tool loops write and edit in the remote clone and that text edits get the ten-minute deadline.

Existing Issue: `product/specs/remote-server.md` and `product/specs/acp.md` were updated for remote writes, edits, and the `edit-file` long deadline, but the user pages still describe only `file read` on the remote host and list ten-minute operations without text edits. Severity: 2/10

Existing Risk: 3/10 - A user reading the docs cannot tell where an agent's write lands on a remote tab, or why an edit waited ten minutes before failing, and the user docs and specs keep diverging.

Proposal Risk: 1/10 - Documentation only; the residual risk is a missed sentence, which a grep for `file read` across the user documentation would surface.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "update remote user docs for host-tool writes and edits". In `documentation/user-documentation/advanced-agents/acp-agent.md`, extend the paragraph beginning "`file read` reads the workspace on the host running the agent" to say granted `file write` and `file edit` also run there, so on a remote tab they change only the remote clone, and that a typed write or edit carries no tag. In `documentation/user-documentation/advanced-agents/remote-agents.md`, say in the remote `ask` paragraph that the tool loop's reads, writes, and edits all resolve in the host's workspace clone, and add text edits to the list of operations that wait up to ten minutes. Add text edits to the same ten-minute list in `documentation/user-documentation/tab-types/file-navigator.md`. Leave the autonomous `agent` paragraphs alone, since that command still refuses mutations.


* Stop advertising `expectedHash` in the agent's mutation primer, since an agent has no way to obtain the editor's private fingerprint it must match.

Existing Issue: `FILE_MUTATION_PRIMER` tells ACP agents that `"expectedHash" is optional on write`, but the value must equal the custom 53-bit `contentHash` fingerprint from `src/editor/save-conflict.ts`, which no tool output exposes (adding hashes to `file read` output is out of scope), so the option is unusable by the agent the primer addresses. Severity: 3/10

Existing Risk: 3/10 - An agent trying to be careful supplies a guessed hash such as a SHA-256 and receives `This file changed on disk since it was loaded`, a misleading refusal that spends tool steps against the eight-step cap or leads it to conclude the file is being changed concurrently.

Proposal Risk: 1/10 - Typed users and the parser keep `expectedHash`, so nothing is removed; the only cost is that an agent no longer learns about an option it could not use.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "remove expectedHash from the agent mutation primer". In `src/file-write/command.ts`, drop the `"expectedHash" is optional on write` clause from `FILE_MUTATION_PRIMER`, keeping the sentence about creating or overwriting files and missing parent folders, and leave `parseFileMutation` and `WRITE_KEYS` unchanged so typed and programmatic callers can still send it. Update `src/file-write/command.test.ts`, which asserts the primer contains `expectedHash` and has six lines, and check `src/acp/tool-table.test.ts`, which compares primers against the constant and should pass unchanged. If `product/specs/acp.md` describes the primer's contents, update that sentence to match.


* Share the remote tab port setup between the typed file reader and the new file mutator instead of duplicating it.

Existing Issue: `src/file-write/tab-write.ts` copies the remote branch of `src/file-read/tab-read.ts` nearly line for line, with its own module-level session counter, its own channel, ready, and workspace lookup, its own open-and-dispose sequence, and a second `Remote connection unavailable.` constant in `src/file-write/outcome.ts` beside the private one in `tab-read.ts`. Severity: 2/10

Existing Risk: 3/10 - A later change to how a tab's remote port is opened, scoped, or reported unavailable, such as the session id scheme or the unavailable wording, has to be made twice, and a miss leaves reads and writes on the same tab behaving differently.

Proposal Risk: 1/10 - A behavior-preserving extraction already covered by both modules' tests; the main hazard is changing a session id prefix that a test asserts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "extract the shared remote tab port helper for file read and file mutations". Add a helper beside `localReadRoot` in `src/file-read/tab-read.ts`, or in a new small module such as `src/file-read/remote-tab-port.ts`, exporting the single `REMOTE_UNAVAILABLE` constant and a `withRemoteTabPort(managers, label, prefix, run)` that looks up the channel, ready promise, and workspace, returns `REMOTE_UNAVAILABLE` when any is missing, opens a `RemoteFileSystemPort` with an incrementing `<prefix>-<n>` id, awaits `run(port, workspace)`, and disposes the port in a `finally`. Use it from `readRemoteFile` in `src/file-read/tab-read.ts` with prefix `file-read` and from `mutateRemoteFile` in `src/file-write/tab-write.ts` with prefix `file-write`, and have `src/file-write/outcome.ts` import the shared constant instead of declaring its own. `src/file-write/tab-write.test.ts`, `src/file-write/outcome.test.ts`, and the existing `file read` tab tests must pass unchanged.
