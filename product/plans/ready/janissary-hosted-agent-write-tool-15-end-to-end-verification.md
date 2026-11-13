# Hosted write tool 15 — end-to-end verification across hosts

**Complexity: 2/10** — test-only; about seven new cases appended to four existing test files with existing harnesses, no production lines and no new fixtures.

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 15 of 15 in the hosted write tool series. Depends on plans 1 through 14 (including the 2a–2c2 and 6a–6b splits), all in `./product/plans/complete/` and implemented on this branch.

Each earlier subplan proves its own seam, and most of the end-to-end scenarios this plan originally listed are already asserted by those subplans' tests (see the coverage map below). This plan adds only the cases that are genuinely missing, then runs the source plan's manual check. It changes no production code; if a new test exposes a defect, the fix belongs in the subplan that owns that seam, reopened, not here.

## Goal

Executable evidence that the feature meets the source plan end to end: writes and edits land in the right workspace, a remote mutation never touches the local disk, a disconnected remote never falls back, grants and settings refuse without an approval prompt, uncertain remote outcomes are not retried, and recordings keep working.

## Design decisions

- **No new `src/file-write/end-to-end.test.ts`.** The earlier draft proposed one; the harnesses it would need (the `runCorePrompt` harness with `mocks`/`settingsWith`, the `startRemoteLoop` `start`/`coreSnapshot`/`framesOf` helpers, the `fakeChannel` in tab-write) are file-local and not exported. Append the missing cases to the file that already owns each harness instead. Do not extract or export these helpers.
- The no-local-disk assertions target the mutation target, temporary files, and any `.janissary/remote-files/` cache materialization — not history, transcript, or ACP record persistence, which may contain payloads.
- No browser harness; UI entries are data-driven and covered in plan 12.
- Test files are exempt from `max-lines` (`eslint.config.mjs`, the `**/*.test.ts` override), so appending to the 400–600-line files below is fine.

## Coverage that already exists (do not duplicate)

| Scenario | Existing test |
| --- | --- |
| Local `tell` prompt writes through the tab runner, no question opened | `src/acp/run-prompt.test.ts` — `describe('runCorePrompt file mutations')`, "runs a granted file write through the tab runner and changes the file on disk" |
| Typed write/edit on a local tab, workspace clone and launch directory with nested parents | `src/file-write/tab-write.test.ts` — "writes under the workspace clone of a local tab", "writes under the launch directory and creates parent folders"; `src/commands/file.test.ts` — "writes and edits a file with one output line each" |
| Remote typed write/edit sends `write-file`/`edit-file`; disconnected channel prints `Remote connection unavailable.` and a same-named local file is unchanged; mid-write close | `src/file-write/tab-write.test.ts` — `describe('on a remote tab')` |
| Remote loop write/edit as workspace steps with no `acp-tool-request` frame; ungranted refusal; agent snapshot refusal | `src/remote/serve-acp-loop.test.ts` — `describe('startRemoteLoop workspace mutations')` |
| Far-side write/edit only in the far workspace, local sentinel unchanged, no cache entry or temp file; `.env` and escaping paths refused | `src/remote/serve-file-navigator.test.ts` — "runs an edit in the far-side workspace only, with no cache entry or temporary file", "refuses a secret path…", "refuses an escaping or secret edit path on the far side" |
| Outside-workspace, `.env`, symlink escape refused locally, nothing created | `src/file-write/target.test.ts` (the `'../escape.txt'`/`'.env'` table and the ancestor-symlink case) |
| Remote edit timeout resolves once and sends exactly one `filesystem-request` (no retry) | `src/file-navigator/remote/port.test.ts` — "resolves an edit as a failure value on close, connection end, and timeout" |
| Disabled `file write` row refuses typed dispatch | `src/native-commands/policy.test.ts` — `describe('file mutation rows')` |
| Default `ask` has no write/edit grant; `tell` has them | `src/plugins/roles/roles-file.test.ts` — "creates seven default roles…"; `src/acp/ask-role.test.ts` |
| Autonomous agent with `file` refused for `file write`/`file edit` | `src/agent/command-tools.test.ts` — "refuses file write and edit forms even with the file grant, before dispatch" |

## Proposed changes — the missing tests

1. `src/acp/run-prompt.test.ts`, inside `describe('runCorePrompt file mutations')`, reusing its `harness`, `GRANTS`, `WRITE`, `mocks`, and the file-level `settingsWith`:
   - **Role refusal for a mutation, no question:** start `'tell'` with `['file read']` only; `deps.runCommand(WRITE)` returns `Command not allowed for role "tell": file write.`, `notes/b.md` does not exist, `mocks.mutateFileInTab` is not called, and `mocks.notify` is not called with `'question'`.
   - **Settings refusal for a mutation, no question:** start `'tell'` with `GRANTS` and `settingsWith({ 'file write': { effectiveEnabled: false, effectiveAgentAccess: false } })`; `runCommand(WRITE)` returns `Command is disabled: file write.` (the message asserted by "applies an agent-access change from the next prompt" in the same file), nothing is written, no `'question'` notification.
   - **Recording of a successful write:** start with a record id (pattern of "records the command and its result, and appends the result entry"); after `runCommand(WRITE)` and `handlers.ranCommand(WRITE, result)`, `managers.acpRecords.activity` was called with `('record-1', 'tool', WRITE)` and `managers.tab.append` with `{ input: WRITE, output: result, acp: true }`.
2. `src/remote/serve-acp-loop.test.ts`, inside `describe('startRemoteLoop workspace mutations')`, reusing `start`, `coreSnapshot`, `framesOf`, `flush`, `WRITE`:
   - **Same-named local sentinel:** create a separate temp dir containing `b.md` = `local`; run the `WRITE` loop; the far `workspace/b.md` is `hello\n`, the sentinel still reads `local`, the sentinel dir lists only `b.md` and has no `.janissary` entry, and `workspace` lists no stray temp file.
   - **Outside-workspace and secret paths:** with grant `['file write']`, a loop whose turns are a write to `../escape.md` then `.env`, then `Done.`; each `acp-tool-step` result starts with `Outside the workspace` / `Secret file` respectively (the reasons in `target.test.ts`), neither file exists, and no new folder appears in `workspace` or its parent.
3. `src/file-write/tab-write.test.ts`, inside `describe('on a remote tab')`:
   - **Timeout is reported once and not resent:** with `vi.useFakeTimers()` (restore in `finally`, as `port.test.ts` does), run a `file edit`, wait for one request, advance past `LONG_REQUEST_DEADLINE_MS` (import from where `port.test.ts` imports it), assert the printed line contains `The remote machine did not answer in time.`, then `remote.reply({ ok: true, value: { replacements: 1 } })` and assert `remote.requests()` still has length 1 and `detachNavigator` was called once.

If any expected message string differs from the current source, assert the source's string (grep `src/file-write/messages.ts` and the role/settings refusal builders) and note the difference in the PR — do not change production text.

Change no production code and no spec; spec and help updates already landed in plans 3, 8, 9, 10, 11, 12, 13, and 14.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after adding the tests.

Then the source plan's manual check (source plan, `## Verification`): with a harness whose internal write tool is denied, create and edit a file in a local workspace via an ACP `tell` prompt, then repeat in a remote workspace with a same-named local sentinel file. Confirm the remote result and the unchanged local sentinel, reject an outside-workspace path, and verify a disconnected remote prints `Remote connection unavailable.` and never falls back to local writing. Verify that allowed mutations run without an approval prompt and that role grants (an `ask` prompt, a role without `file write`) and command settings (the `file write` row disabled) still refuse unauthorized mutations.

Leave `npm run check` for the human, once, after the series.

## Out of scope

- Production fixes; a failing scenario reopens the owning subplan.
- Extracting or sharing the file-local test harnesses.
- Re-asserting scenarios listed in the coverage table.
- New features beyond the source plan.
