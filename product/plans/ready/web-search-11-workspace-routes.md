# Web search 11: route `web` lines in both ACP loops' workspace hosts

**Complexity: 5/10** — ~16 added lines across 3 files, 9 requirements, 13 test scenarios spread over three suites (p=5.40)

The eleventh slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It teaches both `runWorkspace` hosts to run a `web` line on the host running the ACP loop: the local loop (`runCorePrompt` in `src/acp/run-prompt.ts`) calls `searchWebInTab` with the prompt's abort signal, and the far-side loop (`startRemoteLoop` in `src/remote/serve-acp-loop.ts`) calls `webSearch` with the workspace's merged tokens and the loop's own signal. `startRemoteLoop` gains a `tokens` parameter that `RemoteAcp.run` fills. The routes land before the vocabulary and tool entry (`./product/plans/ready/web-search-12-acp-tool.md`), so the moment a `web search` reply line can be extracted, both hosts already run it correctly and neither one ever falls through to the file read branch.

Until slice 12 adds the `web` tool-table entry, no gated path reaches these branches: `gateCoreCommand` (`src/acp/tool-table.ts`) throws `No ACP tool matched command: …` for a `web` line, because `nativeCommandName` finds no `web search` in `NATIVE_ACP_COMMANDS`. That is why this slice's tests call the hosts' `runWorkspace` directly.

## Dependencies

- `./product/plans/ready/web-search-1-command-grammar.md` — `isWebCommandLine` (does not trim; callers pass a trimmed line), `parseWebSearch` (returns `WebSearchCommand | { error }`, the error always `WEB_SEARCH_USAGE`), `WEB_SEARCH_USAGE`, from `src/web-search/command.ts`.
- `./product/plans/ready/web-search-3-provider-tokens.md` — the `tavily` and `tinyfish` rows of `ProjectTokens`, which the merged token set `RemoteAcp` already holds now carries.
- `./product/plans/ready/web-search-6-search-core.md` — `webSearch(request, deps)` and `WebSearchDeps` (`tokens`, `fetch`, optional `signal`, optional `reportDisabled`) from `src/web-search/search.ts`, resolving to `Promise<string>`; once `deps.signal` aborts it always rejects with the abort.
- `./product/plans/ready/web-search-10-typed-command.md` — `searchWebInTab(managers, label, line, signal?)` from `src/web-search/tab-search.ts`: parses first (usage line, no lookup), then picks the side with `localReadRoot`; local calls `webSearch` with `getProjectTokens()`, the global `fetch`, the signal, and a `reportDisabled` that posts the `plugin-failure` notification, and does not catch the abort rejection; remote sends the `web-search` operation and ignores the signal.

All 14 web-search slices ship on one pull request; this slice lands after 1–10 so typecheck and tests stay green at each checkpoint. Slice 12 depends on this one.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Where an agent's search runs (user decision).** On the host running the ACP loop: the machine running Janissary for a local session, and the remote machine when the ACP connection was opened on the remote. The search's HTTP request leaves from that host, and that host's tokens are used. In the tool table this is a `runsOn: 'workspace'` tool, so it rides the same routing as `file read` (`runWorkspace` in `src/acp/run-prompt.ts` locally, `runWorkspace` in `src/remote/serve-acp-loop.ts` on the far side) and never crosses back to the caller; a far-side step carries the `[<host>] ` tag like any other workspace step. A local fallback session on a remote tab (`AcpSessionManager`) searches through the tab's remote connection, as its file steps do, so the search still leaves from the machine holding the tab's workspace.
- **Local route.** `runWorkspace` (inside `runCorePrompt`) routes an `isWebCommandLine` line to `searchWebInTab(managers, label, command, request.abort.signal)` before its file branches. Because `searchWebInTab` picks the side from the tab, a local fallback session on a remote tab searches through the tab's remote connection, as `readFileInTab` reads through it.
- **Local route details (decision).** The test is `isWebCommandLine(normalized)` on the existing `const normalized = command.trim().replace(/^\//, '')`, and the raw `command` is what `searchWebInTab` receives, exactly as the `globFilesInTab(managers, label, command, request.abort.signal)` branch does. The branch sits after the existing `if (!active()) throw new Error('ACP: prompt cancelled.')` guard, so a prompt cancelled before the step starts no search. A local search that disables a provider posts slice 10's notification, because `searchWebInTab` supplies `reportDisabled`; this slice adds nothing for it.
- **Far-side route.** `startRemoteLoop(session, frame, workspaceDir, tokens, send)` gains a `tokens` parameter, and its `runWorkspace` routes an `isWebCommandLine` line to `webSearch` (after `parseWebSearch`) with `tokens`, the global `fetch`, and the loop's `controller.signal`. `RemoteAcp.run` (`src/remote/serve-acp.ts`) passes the merged `this.tokens` it already holds. A parse error answers with the usage line, as the typed command does.
- **Far-side route details (decision).** The far-side branch tests `isWebCommandLine(normalized)` and hands `normalized` on, as its glob branch hands `normalized` to `globWorkspaceCommand`. The parse-and-search lives in one unexported module-level function in `serve-acp-loop.ts`, `searchWorkspaceCommand(line, tokens, signal)`: it returns `parsed.error` (always `WEB_SEARCH_USAGE`) when `'error' in parsed`, and otherwise returns `webSearch(parsed, { tokens, fetch: globalThis.fetch, signal })`. The `runWorkspace` arrow gains only one `if … return searchWorkspaceCommand(normalized, tokens, controller.signal)` line, so `startRemoteLoop` does not pick up the extra branch's `sonarjs/cognitive-complexity`. `tokens` is typed `ProjectTokens` (`import type` from `../project/tokens.js`) and is required, not defaulted: the one production caller and both test helpers pass it.
- **No notification on the far side (user decision).** The far-side route passes no `reportDisabled`: on a remote machine the provider is disabled in the far-side process and the reason appears only in failure lines, since the far side has no notifications tab. The deps object has no `reportDisabled` key at all, matching the remote operation's call in `./product/plans/ready/web-search-7-remote-operation.md`.
- **Cancellation (user decision).** An agent search's request is tied to the prompt's abort signal (the `signal` the ACP invocation already carries), joined with the attempt's timeout, so cancelling or resetting the prompt aborts the in-flight HTTP request at once, starts no further fallback attempt, and the late result is suppressed like any cancelled tool step. On the far side the signal is the loop's `controller.signal`, which `abort()` and `cancel()` already fire. For a local fallback session on a remote tab, the search runs on the remote machine through the `web-search` operation, which has no cancel message; there the late result is still suppressed by the loop's existing cancelled-step handling.
- **Late-result suppression is existing code (decision).** No new handling is added for the abort rejection. `dropLateRejection` in `src/acp/drive-loop.ts` turns a rejection that arrives after the signal aborted into `''`, the local `guardAcpHandlers(…, active)` wrapper drops the step's events, and the far side's `ranCommand` returns early on `aborted()`. Neither route wraps its call in a `try`.
- **Branch order.** The web branch comes first in each `runWorkspace`, before the file mutation and glob branches, so a `web` line never reaches `readFileInTab` or `readWorkspaceCommand`. A bare `web` or malformed `web …` line therefore answers with the usage line rather than a file read error.
- **Host tag (from precedent).** Nothing changes in `tagged` (`src/acp/run-prompt.ts`): a remote session's step that reports `workspace: true` is prefixed `[<host>] `, whatever its command. The far side reports `workspace: true` for a `web search` step once slice 12 gives the tool `runsOn: 'workspace'`; this slice pins the local tagging for a `web search` command line.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Workspace-side dispatch | `src/acp/run-prompt.ts` (`runWorkspace` in `runCorePrompt`, `request.abort.signal`) | A `runsOn: 'workspace'` command runs on the host running the loop, as `file read` and `file glob` do; `web search` joins that routing rather than the caller-side `dispatchNative` path `browser …` uses. |
| Glob branch as the model | `src/acp/run-prompt.ts` (`if (isFileGlobCommandLine(normalized)) return globFilesInTab(managers, label, command, request.abort.signal);`), `src/remote/serve-acp-loop.ts` (`if (isFileGlobCommandLine(normalized)) return globWorkspaceCommand(workspaceDir, normalized, controller.signal);`) | The exact shape of each new branch: predicate on `normalized`, signal passed through. |
| Far-side ACP loop | `src/remote/serve-acp-loop.ts` (`startRemoteLoop`, `runWorkspace`, `controller`, `abort`, `cancel`), `src/remote/serve-acp.ts` (`RemoteAcp`, constructor `private tokens: ProjectTokens = {}`, already passed to `connectAcp`) | Routes a far-side workspace command; supplies the tokens a far-side search uses. `serve-provision.ts` already builds `new RemoteAcp(emit, result.dir, tokens)` with the merged set, so no provisioning change. |
| Late-result suppression | `src/acp/drive-loop.ts` (`dropLateRejection`, `settleUnlessAborted`), `src/acp/run-prompt.ts` (`guardAcpHandlers(…, active)`) | Swallows the abort rejection and the step's events after a cancel. |
| Host tagging | `src/acp/run-prompt.ts` (`tagged` with `remoteHost`), the `workspace: true` flag on `acp-tool-step` frames | The `[<host>] ` tag on a far-side step, unchanged. |
| Spy-through mock pattern | `src/acp/run-prompt.test.ts` (`vi.mock('../file-glob/tab-glob.js', async (importOriginal) => …)` setting `mockImplementation(actual.globFilesInTab)`), `src/remote/serve-acp-loop.test.ts` (same for `globWorkspaceCommand`) | How the tests capture the host and the `startRemoteLoop` arguments without replacing the real loop the other cases rely on. |

## Proposed changes

All relative imports carry `.js`; type-only imports use `import type`.

- **`src/acp/run-prompt.ts`** (139 lines) — import `isWebCommandLine` from `../web-search/command.js` and `searchWebInTab` from `../web-search/tab-search.js`; the `isWebCommandLine(normalized)` branch first in `runWorkspace` (after the `active()` guard), returning `searchWebInTab(managers, label, command, request.abort.signal)`.
- **`src/remote/serve-acp-loop.ts`** (116 lines) — import `isWebCommandLine` and `parseWebSearch` from `../web-search/command.js`, `webSearch` from `../web-search/search.js`, and `type ProjectTokens` from `../project/tokens.js`; the private `searchWorkspaceCommand` as decided above; the `tokens: ProjectTokens` parameter between `workspaceDir` and `send`; the web branch first in `runWorkspace`.
- **`src/remote/serve-acp.ts`** — in `run`, `startRemoteLoop(record.session, frame, this.workspaceDir, this.tokens, (sent) => { … })`. No line is added; the file's length does not change.
- **`product/specs/acp.md`** — in "Autonomous tool loop", after the sentence "A granted `file glob` likewise goes to `globFilesInTab` locally and `globWorkspaceCommand` on the far side.", add workspace routing for `web` lines: a `web` line goes to the same search as the typed command on the host running the loop — locally through the tab (so a local fallback session on a remote tab searches on the remote machine), on the far side with that workspace's merged tokens and no notification — and cancelling the prompt or aborting a remote-hosted run aborts the in-flight request and starts no further provider, except a fallback session's remote search, whose late result is only suppressed. Keep it behavioral. The web tool's primer, gate, and reply-line rule are slice 12's section, not this one.

## Tests

- **`src/acp/run-prompt.test.ts`** — add `searchWebInTab` to the hoisted `mocks` and `vi.mock('../web-search/tab-search.js', () => ({ searchWebInTab: mocks.searchWebInTab }))` resolving to a fixed string. To reach `runWorkspace` without the tool table, add a spy-through `vi.mock('./drive-loop.js', async (importOriginal) => …)` that keeps every actual export (the file imports `CORE_MAX_STEPS`) and wraps `runToolLoop` in `mocks.runToolLoop` calling the actual one; the host is that call's fourth argument (`AcpToolHost`). Cases, in a new `describe('runCorePrompt web routing', …)`:
  - A local tab: `host.runWorkspace('web search x')` resolves to the mock's text; `searchWebInTab` was called with `(managers, 'shell', 'web search x', request.abort.signal)`; `readFileInTab`, `globFilesInTab`, `mutateFileInTab`, and `dispatchNativeLine` were not.
  - Aborting `request.abort` after the call leaves the signal `searchWebInTab` received aborted.
  - With the prompt already aborted, `host.runWorkspace('web search x')` throws `ACP: prompt cancelled.` and `searchWebInTab` is not called.
  - A local session on a remote tab (`tab: { remote: { host: 'far' } }`, no `remoteSession`) still calls `searchWebInTab` with the label, not `readFileInTab`; the remote side choice is `searchWebInTab`'s own (covered in slice 10).
  - Bare `web` and `web foo` reach `searchWebInTab`, not `readFileInTab`.
  - `host.runWorkspace('file read a.txt')` still reaches `readFileInTab`.
  - A remote session on a remote tab: `events.startCommand?.('web search x', true)` and `events.ranCommand('web search x', 'result', true)` tag both record lines and the transcript `input` with `[far] `, as the glob tag test does.
- **`src/remote/serve-acp-loop.test.ts`** — `vi.mock('../web-search/search.js', () => ({ webSearch: mocks.webSearch }))` resolving to a fixed string, and a spy-through `vi.mock('../acp/drive-loop.js', …)` wrapping `driveToolLoop` so the host is its fourth argument. The `start` and `startHeld` helpers pass a `tokens` argument (default `{}`), so every existing case keeps running. Cases:
  - `host.runWorkspace('web search x')` resolves to the mock's text; `webSearch` was called once with `parseWebSearch('web search x')` and deps whose `tokens` is the helper's tokens (for example `{ tavily: 'tvly-far' }`), whose `fetch` is `globalThis.fetch`, whose `signal` is not aborted, and which has no `reportDisabled` property.
  - `' /web search x'` reaches `webSearch` with the same parsed command (the far side normalizes).
  - `runWorkspace('web')` and `runWorkspace('web search x --results 30')` return `WEB_SEARCH_USAGE` without calling `webSearch`.
  - `handle.abort()` aborts the signal passed to `webSearch`; in a separate case, `handle.cancel()` does too.
  - The existing "runs a granted file read against the workspace…" case still passes with the new argument.
- **`src/remote/serve-acp.test.ts`** — a spy-through `vi.mock('./serve-acp-loop.js', …)` wrapping `startRemoteLoop`; after `makeAcp({ tavily: 'tvly-x' })`, `open`, and `run`, the spy's fourth argument equals `{ tavily: 'tvly-x' }`. The existing "leaves no stale run handle…" case keeps the real loop through the spy.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual app check: no reply line is extracted as `web search` until `./product/plans/ready/web-search-12-acp-tool.md`, whose manual check exercises these routes end to end.

## Out of scope

- The vocabulary, native tool mapping, tool-table entry, primer, and reply-line extraction that make these routes reachable (`./product/plans/ready/web-search-12-acp-tool.md`), including the end-to-end test through the gate.
- Default grants (`./product/plans/ready/web-search-13-default-grants.md`).
- A cancel message for the remote `web-search` operation (a typed search is not cancellable, and the source plan adds none).
- Agent-run (`agent …`) handling of `web` lines, already refused by `./product/plans/ready/web-search-9-agent-run-refusal.md`; `src/agent/execute.ts`'s workspace branch is not touched.
- Provisioning changes: `serve-provision.ts` already passes the merged tokens to `RemoteAcp`.
