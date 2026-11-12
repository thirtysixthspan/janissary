# ACP tool loop 26 — specs and user documentation

**Complexity: 2/10** — docs-only; 0 production lines, 0 production files, 17 documented requirements (p=3.62), spanning 9 documentation files

Run order: 26 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Specs and docs", every bullet except the help pages, which subplan 5 already shipped because `src/commands.test.ts` requires them with the command). Depends on subplans 1 through 25, whose behavior it describes.

The series changes behavior that five specs and four user pages describe:
- the ACP tool loop now runs where the workspace is for remote runs;
- every native command has a side;
- native-command settings are snapshotted for a model attempt, while role grants hold for the logical prompt;
- `file read` exists, and `ask` and `tell` grant it by default;
- remote workspace steps carry a host tag;
- the protocol is at version 40.

This subplan brings each document in line, in one pass, so a reader of any of them sees the finished design rather than a half-moved one. It changes no code.

## Current state

Subplans 1–25 and the remote-server fix already landed part of this. These passages match the code and must not be rewritten:

- `product/specs/acp.md` line 91: the loop runs on the host running the agent, and caller tools run where Janissary runs.
- `product/specs/acp.md` lines 93–99, "Remote connections": the far-side loop, caller-tool round trip, and transport-loss settlement are described correctly; the Cancellation section (lines 53–59) already covers a remote request through the same reservation and settlement rules. "Workspace commands" already covers `file read`, so that section needs no `file read` sentence.
- `product/specs/remote-server.md` lines 669–677: the three-way split. Lines 690–699: the agent-run paragraph. Line 846: the out-of-scope bullet. All are correct.
- `product/specs/agent-command.md` line 91: the remote run's loop location and the local authorization of caller commands. Only the `file read` and tag sentences are missing.
- `help/file.md` and the `file` row in `help/commands.md` already exist (subplan 5). The command reference page is generated from them.

## What already exists (reuse, don't rebuild)

| Behavior to describe | Authoritative place |
| --- | --- |
| Snapshot construction and core tag placement | `coreSnapshot` and `tagged` in `src/acp/run-prompt.ts` (lines 19–36, 96–112) |
| Agent-run tag placement | `tagged` and the two `activity('tool', …)` calls in `src/agent/execute.ts` (lines 130–165) |
| Tool order, sides, gate, primer | `createAcpToolTable`, `gateCommand`, `toolPrimer` in `src/acp/tool-table.ts`; `CORE_MAX_STEPS` in `src/acp/drive-loop.ts` |
| Typed `file read` usage, output, errors | `help/file.md`; reader messages in `src/file-read/read.ts` and `src/file-read/format.ts` |
| Far-side loop and frames | `startRemoteLoop` in `src/remote/serve-acp-loop.ts`; `createRemoteAcpRun` in `src/remote/acp-session-run.ts` |
| Protocol 40 rationale and frames | the version 40 comment in `src/remote/protocol.ts` (lines 212–219); frame types in `src/remote/protocol-frames.ts` (lines 158, 260–275) |
| Fallback snapshot behavior | `AcpManager.attempt` in `src/acp/manager.ts` (lines 111–143); `src/acp/manager.test.ts` line 137 pins three `settingsCurrent` reads |

## Design decisions

- Specs follow `ai/guidelines/developer-documentation.md`. Name the implementing module where it disambiguates behavior: `coreSnapshot` and `tagged` in `src/acp/run-prompt.ts`, `createAcpToolTable` and `gateCommand` in `src/acp/tool-table.ts`, `startRemoteLoop` in `src/remote/serve-acp-loop.ts`, and `readWorkspaceCommand` in `src/file-read/read.ts`. State messages verbatim and give edge cases their own place.
- User pages follow `ai/guidelines/user-documentation.md`. They carry commands, flags, and verbatim messages, and leave out paths and module names. Prose follows `ai/guidelines/human-writing-guidelines.md`.
- Each spec states behavior as it is after subplans 1–25, never as a history of the series.
- **Snapshot scope.** `coreSnapshot` runs once per `runCorePrompt` call, and `AcpManager.attempt` calls that once per model attempt. A fallback to the next model therefore takes a fresh native-command snapshot; the role's grants and name stay fixed for the logical prompt on `attempt.settings`. Document that actual scope. Do not write "one snapshot for the whole logical prompt" unless the code changes first; that would make the spec false for a fallback.
- **Placement.** `product/specs/acp.md` gets a new `### File read` subsection after the autonomous-tool-loop paragraphs and before `## Remote connections`. `product/specs/remote-server.md` gets the version 40 paragraph immediately after the version 39 paragraph.
- **Remote-agents wording.** "What stays local" (line 185) makes no ACP claim today. The stale ACP sentence is in "Querying remote ACP" (line 201), so edit there and in the agent-run paragraph (line 215); adding ACP text to "What stays local" would duplicate it.
- `help/file.md` is the typed-command reference and already matches the reader, including the permission-error wording from `product/plans/complete/file-help-error-conditions.md`, which deferred the typed command's functional spec to this subplan. The new `### File read` subsection is that spec. Use its Usage, Output, and Errors sections as the checklist; do not edit it or the generated command reference page.

## Proposed changes

### `product/specs/acp.md`

- **Snapshot, two replacements.** In "Autonomous tool loop", change the line 79 paragraph's "for each prompt" to "for each model attempt" and replace its final clause; in the line 83 paragraph replace "Immediately before each emitted command runs, current settings are checked again." and "A command already executing is not interrupted; the next emitted command is checked afresh." The allow-list and primer are built when the model attempt starts, from `runCorePrompt`'s `coreSnapshot`: one `AcpRunSnapshotRow` per native command from a single `managers.nativeCommandSettings.current()` read, or no rows when no settings manager or snapshot is available. `gateCommand`, extraction, and the allow-list read that snapshot only. A settings change applies from the next model attempt, and from the next prompt. A missing settings manager or row allows the command. Keep the existing refusal texts and order: `Command is disabled: <command>.` before `Command not allowed for role "<role>": <subcommand>.`.
- **Live guard.** A caller-side command still passes `refuseDisabledCommand` in `src/native-commands/dispatch-policy.ts` when `dispatchNativeLine` dispatches it, so a command disabled mid-attempt is refused on its next caller-side run with `Command is disabled: <command>.` and the `command-disabled` notification; an agent-access change has no live guard. A workspace command (`file read`) does not pass the dispatcher, so the attempt snapshot governs it for the rest of the attempt. State both.
- **Sides and order.** State that `browser …`, `question …`, and `db sqlite …` run on the caller, while `file read` runs in the workspace. Correct the line 83 sentence "browser, question, then database" to "browser, question, file, then database"; the database entry stays last because its `match` is the fall-through. Correct the line 87 sentence that says every enabled granted command goes through the ordinary dispatcher: only caller-side commands do; `file read` goes to `readFileInTab` on a local tab or `readWorkspaceCommand` on the far side, which is why a typed read and an agent read share one root and one set of messages. Add `file` to the next sentence's "normal browser, database, or question output" list.
- **New `### File read` subsection** before `## Remote connections`, covering the typed command and the loop tool together:
  - usage `file read <path> [--offset <line>] [--limit <lines>]`; offset defaults to 1 and limit to 2000; one read prints at most 2000 lines; files over 5 MB are refused; the path is one whitespace-free token relative to the root.
  - root: a local tab reads its workspace directory, or its launch/project directory when it has no workspace; a remote tab reads its remote clone through the `read-lines` operation, never local disk; the loop's workspace tool reads the same root on the host running the loop.
  - containment and secrets: an absolute path, a path leaving the root, or a symlink resolving outside it returns `Outside the workspace: <path>.`; `.env`, `.env.*`, and the `SECRET_DENY_PATHS` runs under the real home return `Secret file: <path>.`; the reader names the path as typed.
  - output: numbered lines separated by a tab, number width set by the last line number; a trailing CR is dropped; a line over 2000 code points is cut and ends with `…`; an empty file prints `(empty file)`; a partial read ends with `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`; an offset past the end prints `Offset past end of file (<total> lines): <path>.`, and a one-line file says `(1 lines)`.
  - errors: use `help/file.md`'s Errors list as the checklist and state each line verbatim, including `File not found`, `Is a directory`, `Not a text file`, `File too large (>5 MB)`, and the usage line. A typed read on a remote tab adds `Remote connection unavailable.`, `The remote connection ended.`, and `The remote machine did not answer in time.`.
  - tag: a typed read's output carries no host tag. The loop's workspace step is the only place the tag appears, described next.
  - primer and grants: quote `FILE_READ_PRIMER` from `src/file-read/command.ts` verbatim, and say `file read` is granted by default to `ask` (seven commands) and `tell` (ten) by `src/plugins/roles/roles-file.ts`.
- **Host tag.** In the same section, state the `[<host>] ` prefix exactly: it is added only when the session is a remote ACP session and the step reports `workspace: true`. Do not tag from `tab.remote` alone: `AcpSessionManager` can fall back to a local session on a remote tab, and that workspace step is not a far-side step. The transcript entry's `input` carries the tag, and both `tool` activity lines in the connection record (the command line and the result line) carry it. Caller-side steps, gate refusals, and typed `file read` output are untagged. Anchor this to `tagged` in `src/acp/run-prompt.ts`. A remote agent run tags its workspace steps the same way; [[agent-command]] states the run-specific rule.
- **Remote loop.** No edit. The "Remote connections" section already says workspace commands resolve against the clone and caller tools return over the channel; `file read` is a workspace command.

### `product/specs/remote-server.md`

- Add a **protocol version 40** paragraph after the version 39 paragraph (which ends "…which the exact-version handshake ensures.") and before the "Unavailable sends…" paragraph. State:
  - `acp-run` replaces `acp-prompt` and carries the prompt plus its settings snapshot; `acp-run-end` replaces `acp-end` as the terminal frame.
  - `acp-turn` adds turn boundaries; `acp-tool-request` and `acp-tool-result` carry caller-tool round trips; `acp-tool-step` carries a far-side workspace step or gate refusal; `acp-chunk` still carries reply deltas, and `acp-ready`, `acp-activity`, `acp-error`, and `acp-close` are unchanged.
  - `read-lines` is the read-only filesystem operation behind a typed `file read` on a remote tab; it returns numbered lines or the reader's error line.
  - A version-39 peer would accept prompts but run no loop, so workspace tools would never run where the workspace is while both ends looked healthy; the handshake refuses it. A peer parked under 39 is refused at relay time by its peer record, as for every earlier bump.
- Do not touch the three-way split, the agent-run paragraph, or the out-of-scope bullet; the current state above records why.

### `product/specs/roles.md`

- In the default-role paragraph (lines 56–59), add `file read` to the `ask` grant list and to the `tell` list; ask now grants seven commands and tell ten. Change "those six" to "those seven", and change both "all nine native commands" occurrences (lines 58 and 95) to "all ten".

### `product/specs/agent-command.md`

- At the end of the remote task execution paragraph (line 91), add: a remote run granted `file` runs `janissary file read <path>` in its execution workspace, so the caller's directory is not the read root; other granted commands still execute and are authorized locally.
- Also state that a remote run's workspace step is tagged `[<host>] ` on both monitor/record activity lines, while a caller-side step and a gate refusal are untagged. Leave line 77's local-only sentence unchanged.

### `product/specs/application-commands.md`

- Replace the line 41 paragraph ("An ACP agent command is checked again immediately before every emitted call") with the snapshot rule:
  - the effective settings are read once when the model attempt starts and become part of that attempt's snapshot; the primer, allow-list, extraction, and gate use it for the whole attempt, locally and on a remote run; a change applies from the next attempt or prompt.
  - a row that is disabled or agent-off returns `Command is disabled: <command>.` as a normal tool result and is recorded as one tool step; that check precedes the role-grant refusal; a missing manager or row allows the command. Both a disabled and an agent-off row emit the same `command-disabled` notification.
  - caller-side commands still pass `refuseDisabledCommand`, so a command disabled mid-attempt is refused on its next caller-side run with the same text and notification; agent access has no live guard. A workspace tool such as `file read` does not pass the dispatcher, so the snapshot governs it for the rest of the attempt.
  - keep the existing caller-side dispatcher behavior, the browser/database/question output and cancellation text, and the notification rules; drop "the next emitted command re-checks settings".
- Change line 19's "For an ACP prompt, the role's grants are intersected with the current effective agent access" to "For each ACP model attempt, the role's grants are intersected with the effective agent access captured for that attempt" so the two paragraphs agree.

### `documentation/user-documentation/advanced-agents/acp-agent.md`

- Line 11: drop "local" from "separate local session"; an `agent on <host>` run uses a remote session, and the link to the agent-command page already covers it.
- The default-grant summaries (lines 35–39 and 71–73) gain `file read`: ask can read a file as well as list and query databases, browse, and ask or approve a question; tell has those commands plus database create/delete and browser eval.
- Line 80 "Only these three tools" becomes four.
- The "In a workspace or on another host" paragraph (lines 102–106) says `file read` reads the workspace on the host running the agent — the remote clone on a remote tab — while `db`, `browser`, and `question` still act on the machine running Janissary. A remote workspace step shows `[<host>] ` on its transcript line and both connection-record activity lines; a typed `file read` and a caller-side step carry no tag. No paths or module names.

### `documentation/user-documentation/advanced-agents/agent-command.md`

- Line 25 splits "commands the agent is allowed to run" into the two sides: `file read` uses the execution workspace, while `db`, `browser`, and `question` use the caller tab's captured directory and context.
- Line 27: "Janissary keeps command grants and tool commands on the original caller's machine" becomes "keeps command grants and caller-side commands on the original caller's machine"; state that `file read` runs in the execution workspace.
- Line 31: a remote run's workspace step is shown with `[<host>] ` in its activity.
- Line 91: "Granted Janissary commands still run on your original machine" becomes "Granted caller commands still run on your original machine"; `file read` reads the execution workspace.

### `documentation/user-documentation/advanced-agents/remote-agents.md`

- "Querying remote ACP" (line 201): the loop runs on the remote host, so `file read` reads that host's clone; `db`, `browser`, and `question` still act locally and their results come back.
- The agent-run paragraph (line 215): replace "the autonomous tool loop stays on your machine" with the loop running on the remote host; `file read` reads the remote workspace, `db`, `browser`, and `question` use local app and files, and other granted commands still run and are authorized locally.
- Leave "What stays local" (line 185) alone; it makes no ACP claim and a second statement would duplicate "Querying remote ACP".

### `documentation/user-documentation/tab-types/roles.md`

- Line 17 and line 29: ask's default commands gain reading a file from the workspace; tell inherits it.
- Line 27: "all nine native commands" becomes "all ten native commands".

## Tests

None. This is prose only, and `src/commands.test.ts` already covers the help page and table row from subplan 5. The search checks under Verification are the regression net for stale wording.

## Out of scope

Any code change. New spec or user pages; the edits stay in the existing ones. No edit to `help/file.md`, `help/commands.md`, or the generated `documentation/user-documentation/command-reference/` page. No plan or task edits.

## Verification

- `$janissary/scripts/run.mjs check-diff` — the standard gate; a docs-only diff selects no lint, typecheck, or test step, so it only confirms no source-side work is in scope.
- `npm run docs:build` — confirms the site builds with the generated `file` reference page.
- Search the touched docs; each of these must have no matches: `all nine native commands`, `Only these three tools`, `browser, question, then database`, `checked again immediately before every emitted call`, `the next emitted command re-checks settings`, `the autonomous tool loop stays on your machine`.
- Confirm `product/specs/remote-server.md` has a version 40 paragraph between the version 39 paragraph and "Unavailable sends…", and that `product/specs/acp.md` has a `### File read` subsection before `## Remote connections`.
- Re-read each edited section against the code paths named under "What already exists" and the behavior subplans 1–25 implemented. Subplan 27's step list is the acceptance test for that behavior, but it runs after this plan.
