# Reusable workspace command runners and snapshot rows
**Complexity: 5/10** — ~35 added production lines, 2 existing files, 8 requirements, 30 scenarios (p=5.68)

## Goal

Extract the existing remote workspace routing into `runWorkspaceCommandIn(dir, command, signal)` in `src/acp/workspace-runner.ts` and expose the existing native-settings row mapping as `coreSnapshotRows(settings)` from `src/acp/run-prompt.ts`. Preserve the five file commands and current core snapshots so later executors can reuse both helpers without copying them.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 8 of 23.

## Decisions and dependencies

Dependencies: None; both extraction sites and their input types exist in the current repository. Plans 1–7 need not land for this extraction. Later subagent execution consumes these helpers; do not add a consumer, launcher, remote workspace selector, or other later API here.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

| Piece | Verified location and reuse |
| --- | --- |
| Root-taking command routing | `src/remote/serve-acp-loop.ts:45`, `host.runWorkspace`, owns the exact normalization and mutation → glob → grep → read routing to extract. `src/remote/serve-acp.ts:107`, `startRemoteLoop`, supplies its existing workspace directory. |
| Root-taking file services | `src/file-write/tab-write.ts:32`, `runFileMutation`; `src/file-navigator/filesystem-port.ts:123`, `LocalFileSystemPort`; `src/file-glob/glob.ts:63`, `globWorkspaceCommand`; `src/file-grep/grep.ts:52`, `grepWorkspaceCommand`; and `src/file-read/read.ts:43`, `readWorkspaceCommand`. Preserve their parsing, path policy, output, and error behavior. Only glob accepts the run's signal. |
| Command recognizers | `src/file-write/command.ts:26`, `isFileMutationCommandLine`; `src/file-glob/command.ts:103`, `isFileGlobCommandLine`; and `src/file-grep/command.ts:91`, `isFileGrepCommandLine`, distinguish full subcommand tokens, including bare or malformed arguments. |
| Existing authority boundary | `src/acp/drive-loop.ts:49`, `gateCommand`, authorizes a command before `host.runWorkspace` runs. The new runner executes already-selected workspace commands and does not own grants, settings, or the tool cap. |
| Snapshot rows | `src/acp/run-prompt.ts:26`, `coreSnapshot`, maps the current `NATIVE_ACP_COMMANDS` at `src/plugins/roles/shared.ts:3` through `effectiveCommandSetting` at `src/native-commands/policy.ts:10`. Use `CommandSettingsSnapshot` from `src/native-commands/settings-types.ts:5` and `AcpRunSnapshotRow` from `src/acp/types.ts:123`. |
| Snapshot capture and local roots | `src/acp/manager.ts:128`, `runCorePrompt`, receives the already-captured settings. Its local `runWorkspace` at `src/acp/run-prompt.ts:93` uses tab-bound services; `src/file-read/tab-read.ts:7`, `localReadRoot`, chooses the tab's workspace or launch directory. Keep that route intact, including local fallback on remote tabs. |

## Planned file scope

Add `src/acp/workspace-runner.ts` and its colocated `src/acp/workspace-runner.test.ts`. Edit only the existing production files `src/remote/serve-acp-loop.ts` and `src/acp/run-prompt.ts`. Extend the existing `src/remote/serve-acp-loop.test.ts` and `src/acp/run-prompt.test.ts`. Update implementation ownership references in `product/specs/acp.md` and `product/specs/remote-server.md`; this unit preserves their observable behavior. No new snapshot/type module or change to the root-taking file services is needed.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add `runWorkspaceCommandIn` to the new workspace-runner.ts. It takes the supplied directory, command string, and optional `AbortSignal`, and returns a string or a Promise of a string like `AcpToolHost.runWorkspace` at `src/acp/types.ts:119`. Keep the function non-async so the existing synchronous read path stays synchronous. Normalize exactly as the current far-side body does: trim the whole command, then remove at most one leading slash. Pass that normalized command to each existing service without changing case or command arguments.

2. Preserve the existing routing order: write/edit recognizer to `runFileMutation` with a new `LocalFileSystemPort` and the passed directory; glob recognizer to `globWorkspaceCommand` with that directory and the exact supplied signal; grep recognizer to `grepWorkspaceCommand` with only directory and command; otherwise `readWorkspaceCommand`. Bare or malformed recognized commands reach their own parser and retain its usage text. Unrecognized input keeps the read-parser fallback. Do not introduce a catch, wrap a rejection, add a blanket aborted-signal refusal, or forward the signal to services that have no cancellation parameter. Confinement, protected paths, diagnostics, and mutation outcomes remain the existing services' responsibility; this is no new root or security policy.

3. Replace only `startRemoteLoop`'s workspace-routing body with a call to the helper using its unchanged `workspaceDir`, command, and `controller.signal`; remove the displaced service imports from serve-acp-loop.ts. Keep the host's caller forwarding, pending request bookkeeping, loop gate, cancellation, event frames and late-result suppression intact. `startRemoteLoop` has one production caller, `RemoteAcp.run` at serve-acp.ts:107, which needs no signature or code change. Keep `runCorePrompt`'s tab-bound host at run-prompt.ts:93 unchanged.

4. Define and export `coreSnapshotRows` directly in run-prompt.ts, taking `CommandSettingsSnapshot | undefined` and returning `AcpRunSnapshotRow[]`. Undefined settings returns a fresh empty array. A defined snapshot returns one fresh row for every current vocabulary name, in `NATIVE_ACP_COMMANDS` order, using `effectiveCommandSetting` for both effective booleans. A defined snapshot with no commands therefore yields permissive rows for the whole vocabulary, unlike undefined settings; a missing row defaults both effective values to true. Copy effective values rather than saved `enabled`/`agentAccess`, omit non-vocabulary settings rows, and do not mutate or retain mutable references to the input. Do not hard-code a vocabulary length; earlier vocabulary work may already be present.

5. Have `coreSnapshot` call `coreSnapshotRows` with the same captured settings argument. Leave its role, roleName, grants, withoutTools, return shape and capture timing unchanged. The helper performs no settings-manager read or I/O, and later settings edits do not change already-built rows. Later consumers import it directly from run-prompt.js; add no re-export or future import. Existing settings tests at `src/acp/run-prompt.test.ts:365`, `applies an agent-access change`, line 388, `keeps the settings captured`, and line 398, `runs a granted command`, pin next-prompt updates and missing-manager behavior.

6. Update `product/specs/acp.md:89`, the `coreSnapshot` row description, and its far-side routing paragraph at line 99, beginning `browser …`, to name the shared row mapping and new runner. Keep the file-specific contracts at lines 168, 205 and 221 consistent. Update `product/specs/remote-server.md:677`, beginning `A remote shell`, with the far-side runner's ownership. Retain the existing commands, roots, cancellation limits and wire contract. Keep the changes within the stated file scope. Current nonblank/noncomment production counts are 138 for run-prompt.ts and 110 for serve-acp-loop.ts; the row helper fits in the former and routing removal shrinks the latter. The new runner should remain a small module comfortably below 200 counted lines. Use direct defining-module imports with `.js` extensions and typed settings/row values; do not compact code to meet the limit.

## Tests

In workspace-runner.test.ts use separate caller and target scratch directories with different contents. Run read, glob, grep, write, and edit against the target and assert target-root results and mutations while caller files remain untouched. Follow `src/remote/serve-acp-loop.test.ts:76`, the `beforeEach` scratch-home setup, so file policy never reads a real home configuration. Check outer whitespace plus a single leading slash, case-insensitive subcommand routing, bare glob and grep usage, malformed mutation JSON, and the read-parser fallback for an unrecognized command. Assert traversal and an outside-resolving symlink cannot read or mutate outside the passed root, and protected `.janissary` mutations still refuse without changes. Use the existing root-service behavior as the expected result; do not reimplement policy in the test.

Add a focused glob spy assertion that the exact signal reaches the existing service and becomes aborted when its controller aborts. Do not expect grep or mutations to accept that signal. Pin a rejected grep service call propagating its original rejection rather than becoming no-match or usage output. Retain the service-level suites as the detailed policy coverage; avoid copying their entire edge-case matrices.

Keep the existing remote-loop regressions at `src/remote/serve-acp-loop.test.ts:141,209,452,465,570,580,609`: workspace result frames and provider feedback, caller requests, write/edit mutations, glob signal cancellation, and grep forwarding. Add a single helper-delegation assertion for the passed workspace directory and run signal while allowing the real helper through. Existing glob/grep mocks target the defining service modules and continue to observe them through the extraction. Preserve current cancellation and late-result tests; no change to frames or grants is expected.

In run-prompt.test.ts add direct `coreSnapshotRows` cases for undefined settings, a defined empty snapshot, disabled effective enabled, disabled effective agent access, a partial snapshot with missing vocabulary rows, and an unrelated settings row. Use a typed snapshot whose saved booleans differ from its effective ones to prove the helper copies effective policy. Assert vocabulary order and fresh row objects, then change the source snapshot and confirm captured rows remain unchanged. Retain the existing prompt-level snapshot tests named in step 5 and the local/tab-remote routing regressions; helper reuse must not change those paths.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: From a separate caller fixture, invoke the runner against a target fixture for all five commands; confirm only that target changes, then attempt an outside write and confirm refusal without changes. Drive one real remote-loop fixture through a workspace step and then a caller step to verify the existing workspace result frame and caller request sequence. Compare rows from undefined settings and a defined empty snapshot, then disable an effective setting for the next prompt and confirm the current prompt retains its captured policy. These checks use current services and no public subagent command.

## Out of scope

No new grant, session, public command, subagent consumer, remote frame, protocol version, root service policy, or tab-bound runner behavior. No manager, client, vocabulary, launch, or dispatch changes.
