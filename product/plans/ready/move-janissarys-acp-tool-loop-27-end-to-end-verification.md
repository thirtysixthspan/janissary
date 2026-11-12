# ACP tool loop 27 — end-to-end verification

**Complexity: 2/10** — no production code; 10 numbered checks (8 needing a real remote host) plus 6 out-of-scope checks, 16 scenarios total (p=4.31)

Run order: 27 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Verification"; "Out of scope"). Depends on subplans 1 through 26.

Each earlier subplan proves its own piece with unit tests. This one is the end-to-end pass: on a real remote host it proves that the pieces meet — a real far-side loop, local caller tools, and the typed command working together — and in this workspace it proves every locally reachable piece and records the remote-host half as deferred. It also checks that nothing listed as out of scope crept in. It changes no code. A failure found here is fixed in the code area the owning subplan delivered, on the same branch, by the normal repair task, and this list is rerun.

## What this workspace can and cannot verify

This workspace has no second machine reachable as a remote host with this build. Every check that needs `shell … on <address>` or `agent on <host>` cannot run here, so it is recorded as deferred, never as passed. Do not substitute a loopback or same-machine SSH connection for that host; the deferred rows stay deferred.

The run still proves the mechanics locally. The focused server suite covers the far-side loop, caller round trips, tagging, cancellation, and transport loss. The protocol version and frame inventory are static. The tool-side and vocabulary inventories show the out-of-scope behavior did not creep in. The local tab's `file read` is covered end to end by the suite and, when an interactive instance is available, by typing the two commands in step 7. A unit test that covers the same code path does not turn a deferred remote-host observation into a pass.

When a real remote host is available, run the deferred matrix and replace each deferral with the observed result. The PR test task (`ai/tasks/feature/test-pull-request.md`) classifies a step that needs a remote host as `environment` and does not run it, so a green test pass is not evidence for these rows either; a human with a second machine must run them.

## Local setup

Start a fresh instance from this branch with a scratch root, as the PR test task's start task does, and open one local shell tab whose working directory is this checkout. Create `.env` with a dummy value if it does not exist. No remote host is needed for steps 1 and 7 or for the local checks.

## Remote host setup (only when a remote host is available)

Install or link this branch's protocol-40 build on the host so `janus` on its `PATH` is the same build; `command -v janus` must resolve there. Janissary ships nothing to the remote. A different build is refused at the handshake with `Remote janissary speaks protocol version <n>; this one speaks <m>.`.

Open the tab with `shell <label> on <[user@]host[:path]>`. Its clone must be on this branch or a branch containing subplans 1 through 26, and must have a matching `origin`, because the host's own clone is used. It must contain a file the local checkout lacks: create `notes/remote-only.md` there and commit it without pushing, or leave it untracked. Give it at least four lines so the `--limit 3` read leaves a continuation notice.

Use a scratch home for the app so `~/.janissary/roles.json` is created fresh, where `ask` and `tell` grant `file read`; or add `file read` to both roles in the roles tab. An existing roles file is never rewritten, so a roles file without that grant fails every `file read` step with `Command not allowed for role "<role>": file read.`.

For step 8, on the remote clone create a task file under `ai/tasks/` that instructs the agent to read `notes/remote-only.md` and quote its first lines, and a test skill under `skills/` with a `SKILL.md` and a `janissary.json` sidecar granting `file`. The task and selected skills resolve on the execution host, so both must exist there.

## Steps

Steps marked **local** run now. Steps marked **remote host** are deferred in this workspace; run them only with the setup above.

1. **Local.** Record `git rev-parse --short HEAD` and run the local checks below. Every focused test passes. `$janissary/scripts/run.mjs check-diff` on this clean branch prints `check:diff: no changes` and is not evidence; the human's `npm run check` and the orchestrator's `$janissary/scripts/run.mjs pr-check-gate` remain the end gate.

2. **Remote host.** On the remote tab, `tell read notes/remote-only.md and summarize it`. The transcript shows a `[<host>] file read notes/remote-only.md` tool step and a correct summary. The connection record's first `tool` activity line is `[<host>] file read notes/remote-only.md`; the second is `[<host>] ` followed by the numbered file text. Both lines carry the tag; the summary itself is untagged.

3. **Remote host.** On the remote tab, type `file read notes/remote-only.md --limit 3`. It prints three numbered lines and the continuation notice, all untagged.

4. **Remote host.** On the remote tab, `tell create a sqlite database named probe`. `probe.sqlite` appears under the local project directory's `.janissary/db/sqlite/` and in the local connections panel; the `acp: true` transcript entry and both record lines are untagged. Use a fresh name on a rerun; creating an existing database answers `Database "probe" already exists.` and does not exercise the step.

5. **Remote host.** On the remote tab, ask something that makes the agent emit `question ask …`, for example `tell use the question command to ask me which color to use`. The question panel appears locally, and the answer reaches the remote agent, which uses it in its reply.

6. **Remote host.** On the remote tab, start a long `tell`, then `tell reset` mid-run. The original tell line settles as `ACP session closed.`, the reset line prints `ACP tell session reset — next tell prompt will start fresh.`, and no further tool step appears. The ask role's session is untouched.

7. **Local.** On the local tab, `file read .env` prints `Secret file: .env.` and `file read ../x` prints `Outside the workspace: ../x.`. `src/file-read/read.test.ts` asserts both lines exactly (`read('.env')` and `read('../x')`), so the suite can stand in for typing them when no interactive instance is available.

8. **Remote host.** Run `agent on <host> in a tab with skill <name> execute <task>`. Open the `agent:<caller tab>` row in the connections tab: its first tool activity line is `[<host>] file read notes/remote-only.md` and its second is `[<host>] ` followed by the numbered file text. The run completes with the file's content in its answer. The monitor shows the run's status and final response; the tagged tool lines are the connection record's, not the monitor's.

9. **Remote host.** In the commands tab, turn off **Agent access: db sqlite create**, then run `tell create a sqlite database named probe2` on the remote tab. The step answers `Command is disabled: db sqlite create.`, a `command-disabled` notification appears locally, and the step is untagged. Turn **Agent access** back on afterwards.

10. **Remote host.** Drop the remote connection while a `tell` is running: find the tab's local `ssh` process in `ps` and kill it so the automatic reconnect path runs. Do not use `connections close ssh:<id>`, which closes the tab. The prompt settles with `ACP: Remote connection lost.` in both the transcript line and the pending reply, and after the tab reconnects the next `ask` starts a fresh session with no replayed loop event.

## Local checks that do not need a remote host

Run these in order. They are the only evidence a run without a remote host may mark passed.

1. **Commit and focused suite.** Record `git rev-parse --short HEAD`. Confirm `git status --short` shows no source, test, spec, or config changes. Run `npm run typecheck:diff`, then `npm run test:server -- src/acp src/agent src/file-read src/commands src/remote src/file-navigator/remote src/plugins/roles src/completion src/native-commands src/application-commands.test.ts src/monitor src/conversations src/personas.test.ts`, then `npm run test:client -- web/src/shared/command-availability.parity.test.ts`. All pass.

2. **Protocol and frame inventory.** `REMOTE_PROTOCOL_VERSION` is 40 (`src/remote/protocol.ts:220`, and `src/remote/protocol.test.ts:968` asserts `is 40`), and `src/remote/protocol.test.ts:1031` rejects a mismatched version naming both. `CLIENT_FRAME_TYPES` and `SERVER_FRAME_TYPES` (`src/remote/protocol-frames.ts:312` and `:319`) carry `acp-run`, `acp-tool-result`, `acp-turn`, `acp-tool-request`, `acp-tool-step`, and `acp-run-end`, and carry no `acp-prompt` or `acp-end`. The only remaining mentions of the old names in `src/` are the protocol history comments in `src/remote/protocol.ts` and the tests that assert they are now unknown (`src/remote/protocol.test.ts:456`).

3. **Tool-side and vocabulary inventory.** In `createAcpToolTable` (`src/acp/tool-table.ts:33`), `browser`, `question`, and `database` declare `runsOn: 'caller'` (`:41`, `:50`, `:68`) and `file` declares `runsOn: 'workspace'` (`:59`); `gateAgentCommand` (`:118`) routes only `file read` to the workspace. `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts:3`) contains `file read` and no `file write` or `file edit`; `parseFileRead` (`src/file-read/command.ts:40`) answers any other `file` subcommand with the usage line. `DEFAULT_ROLES` (`src/plugins/roles/roles-file.ts:27`) grants `file read` to `ask` and `tell` only, at `:71` and `:84`.

4. **Test-backed mechanics.** The focused suite above proves these, and each deferred row cites the test that covers its mechanics:
   - Far side runs a granted workspace read itself and reports the numbered result: `src/remote/serve-acp-loop.test.ts:106`, "runs a granted file read against the workspace and reports the numbered result".
   - Far side sends a caller step as a numbered request and feeds the result into the next prompt: `src/remote/serve-acp-loop.test.ts:175`.
   - Far side refuses a disabled agent-off row with `workspace: false` and `refused: 'disabled'`: `src/remote/serve-acp-loop.test.ts:136`.
   - Far side ignores a late result after cancel and aborts a run waiting on a caller result: `src/remote/serve-acp-loop.test.ts:333` and `:356`.
   - Remote workspace steps are tagged on both record lines and the transcript, while caller-side and refused steps are untagged: `src/acp/run-prompt.test.ts:374`, `:472`, `:488`; `src/agent/execute.test.ts:229`, `:273`.
   - A far-side disabled refusal raises the local `command-disabled` notification: `src/acp/run-prompt.test.ts:461`.
   - A remote tab never reads its workspace from the local disk: `src/file-read/tab-read.test.ts:24` and `src/acp/run-prompt.test.ts:354`.
   - Typed remote reads go through the port and print the reply untagged, and a missing channel prints `Remote connection unavailable.`: `src/commands/file.test.ts` ("sends read-lines on its own session and prints the reply untagged") and `src/file-read/tab-read.ts:35`.
   - Closing the `tell` role settles its running prompt as `ACP session closed.` and leaves the ask role alone: `src/acp/manager.test.ts:572`.
   - Transport loss reaches the run events and detaches the session: `src/remote/acp-session.test.ts:276`. The owner settles the prompt as `ACP: Remote connection lost.`: `src/acp/record-feed.test.ts:234`.
   - Transport detach aborts the far-side loop, and a close sends no run-end or cancel: `src/remote/serve-acp.test.ts:451` and `:418`.

5. **Out-of-scope static checks.** `git diff --name-only master...HEAD -- src/monitor src/conversations src/personas.ts src/persona-parsing.ts` is empty, and those areas' tests run in the focused suite. `src/remote/replay-history.ts` retains terminal and transcript history only; it carries no ACP frames, so a reattach has no loop event to replay.

## Out-of-scope checks

Confirm each of these still holds. The annotation says how it is checked here.

- `db`, `browser`, and `question` never run on the remote host. **Local static and suite:** the caller declarations in `src/acp/tool-table.ts` and the caller-request tests in `src/remote/serve-acp-loop.test.ts`. The live observation on a real host is part of the deferred matrix.
- No remote database or browser appears in the local connections panel or the sql tab. **Remote host only:** a consequence of the caller declarations above, but the panel observation needs a live remote tab.
- No `file write` or `file edit` tool exists. **Local static:** `NATIVE_ACP_COMMANDS` and `parseFileRead` above.
- A far-side loop does not survive a transport loss, and no loop event is replayed on reattach. **Local suite:** the detach and close tests above. The live observation is deferred with step 10.
- Monitors, conversations, and editor persona queries behave as before. **Local static and suite:** the branch diff leaves their files untouched, and their tests pass in the focused suite. No remote host is involved.
- Typed `file read` output and caller-side steps carry no host tag. **Local suite and manual:** the local typed read in step 7 and the untagged caller-step tests above. The remote typed read is deferred with step 3.

## Recording results

Keep one table in the run's report under a `Verification` heading, with a row for each numbered step and each local check. The only outcomes are:

- `Passed locally — <evidence>`: the command and observation, or the test file and test name.
- `Deferred — needs a remote host`: the exact typed command and expected observation. This is not a pass.
- `Failed — <what happened>`: stop and report; this plan changes no code, so the repair runs through the normal PR repair task against the code area that owns the behavior.

Never write "passed", "verified", or "confirmed" for a deferred row. A run without a remote host completes this subplan when every local check passes and every remote-host step is recorded as deferred; it must not describe the feature as end-to-end verified on a remote host. PR #1992's description already carries a remote-host paragraph; keep that paragraph in sync with the deferred rows rather than adding a second list.

## Out of scope

Code, test, spec, or doc changes; those belong to the earlier subplan that owns the behavior or to the repair task. This subplan records verification only.

## Verification

`$janissary/scripts/run.mjs check-diff` during any edit to the working tree, but on a clean branch it prints `check:diff: no changes`; the focused suite under "Local checks that do not need a remote host" is the evidence. `npm run check` is the human's end-of-work gate, not this run's. Finish by recording the result table as described above and leaving every remote-host row deferred unless it was actually run on a real host.
