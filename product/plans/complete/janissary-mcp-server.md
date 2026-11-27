# feat: local Janissary MCP server that lets harnesses ask the user through the question panel

**Complexity: 9/10** — ~1,250 added lines across 24 edited files, ~60 requirements spanning a new server, three harness integrations and a remote relay (p=8.85)

## Goal

Run a local-only MCP server inside the main Janissary process so AI harnesses (claude, opencode, codex) can ask the user a question through Janissary's own question panel instead of through the harness. The server is meant to grow into exposing every Janissary command, but this version exposes only `question`. A remote harness gets an MCP endpoint on its own host, inside that session's `janus remote-serve`, which relays each command over the session's existing connection to the local Janissary to run. Feature text: "The model is intended to expose all janissary commands, but be limited to just one command `question` at the moment. The intended goal is to allow harnesses to questions the user via the janissary question functionality rather than via the harness."

## Requirements

Server

1. The MCP server runs inside the main application process — feature text: "setup a MCP server for janissary run from the main application process - local only."
2. The MCP server listens on loopback only — user answer: "Plain HTTP on loopback": "Serve HTTP on 127.0.0.1 only".
3. The MCP server serves plain HTTP, with no TLS certificate — user answer: "Plain HTTP on loopback": "Serve HTTP on 127.0.0.1 only".
4. Every MCP request requires the server's bearer token — user answer: "requests require auth token".
5. One server-wide token authenticates every harness — user answer: "One server-wide token for every harness."
6. The token is persisted under `.janissary/` and survives a Janissary restart — user answer: "Stable port + persisted token".
7. On its first start a project picks a free loopback port and saves it beside the token in `.janissary/` — user answer: "Pick free once, persist".
8. Every later start of that project reuses the saved port — user answer: "then reuses it on every later start."
9. An `mcpPort` config key overrides the saved port — user answer: "An `mcpPort` config key can override it."
10. A port that is already taken stops the MCP server from starting — user answer: "If the port is taken, the server reports it and doesn't start."
11. A server that cannot start leaves Janissary running normally — user answer: "Notify; launch w/o MCP": "Janissary starts normally".
12. A server that cannot start records one notification `MCP server failed to start: <reason>` — user answer: "records one notification, e.g. `MCP server failed to start: <reason>`."

Tool

13. The server advertises exactly one MCP tool, named `question` — feature text: "be limited to just one command `question` at the moment"; user answer: "One `question` tool, kind arg".
14. The `question` tool takes the arguments `tab`, `kind` (`ask` or `approve`), `question`, and, for `approve`, `options` — user answer: "arguments {tab, kind: "ask"|"approve", question, options?}".
15. The question opens the question panel on the tab its `tab` argument names — feature text: "the question dialog should show up on the calling harness tab - tab must be provided by the caller."
16. Any authenticated caller can name any open tab; a token is not bound to a tab — user answer: "The caller passes any `tab` label, and the server shows the question there if that tab exists. No per-tab binding."
17. The tool returns the user's answer as its text result — feature text: "allow harnesses to questions the user via the janissary question functionality".
18. A user Cancel in the panel returns `Question cancelled.` as the tool's text result — established behavior: `product/specs/agent-questions.md` § Cancellation "return `Question cancelled.` to the waiting agent".
19. A `tab` that names no open tab returns an MCP tool error result and opens no panel — user answer: "MCP tool error + message".
20. An unknown `kind`, an empty question, or an `approve` with no options returns an MCP tool error result and opens no panel — user answer: "Return an MCP tool result flagged isError with a specific message".
21. The error texts are exactly `No tab named "<tab>".`, `kind must be "ask" or "approve".`, `question must not be empty.`, and `approve needs at least one option.` — user answer: "Specific sentences".
22. An MCP cancellation or a closed connection from the caller aborts its registered question and withdraws the panel — user answer: "Withdraw + notify": "An MCP cancellation or a closed connection aborts the registered question, the panel disappears".
23. Withdrawing a question shows the next queued question for that tab, if any — user answer: "the next queued question (if any) appears."
24. Withdrawing a question records the notification `Question from <tab> withdrawn` — user answer: "also record a notification `Question from <tab> withdrawn`".

Unread and notifications

25. A question on a tab that is not focused sets that tab's unread flag — feature text: "throw the unread flag on the tab if it is not focused."
26. The unread flag is set for every question raised on an unfocused tab, whether it comes from the MCP tool, an ACP agent, or the command line — user answer: "All questions".
27. The `Question from <tab>` notification is still recorded alongside the unread flag — user answer: "The notification stays".

Harness launch

28. Every harness launch receives the server's connection and authentication details — feature text: "the server should expose its connection and authentication details to all harnesses so that when run they have access to the available commands."
29. Each harness lists the server under the name `janissary` — user answer: "Server name `janissary`".
30. Every harness launch receives its own tab's label in `JANISSARY_TAB` — user answer: "Env label + shared token".
31. Every harness launch receives the server URL in `JANISSARY_MCP_URL` and the token in `JANISSARY_MCP_TOKEN` — user answer: "janissary + JANISSARY_MCP_*".
32. A harness launched with `--offline` receives no MCP flags and no MCP environment variables — user answer: "No MCP config at all".
33. A `harness … --no-mcp` launch receives no MCP flags and no MCP environment variables — user scope extra: "`--no-mcp` launch flag".
34. A harness launched while the server is not running receives no MCP flags and no MCP environment variables — user answer: "Harnesses launched while it's down get no MCP flags or variables."

Remote

35. While a remote session is connected, an MCP server is available to the harnesses it runs on the remote machine — user answer: "what we want is for an establish connection to a remote machine, where a harness is being run, for a mcp server to be available."
36. A remote harness's MCP server runs on the remote machine, inside that session's `janus remote-serve` — user answer: "the mcp server could be remote".
37. The remote MCP server passes each command back to the local Janissary process for execution, over the session's existing connection — user answer: "but pass commands back to the local machine for execution."
38. A remote harness's question runs in the local Janissary process, and its answer returns to the remote harness — user answer: "the question executes locally and the mcp server responds to the remote harness."
39. A remote harness can only run commands on the local process — feature text: "can only run commands on the local process."
40. The remote MCP server's connection and authentication details reach the harness in its far-side spawn environment — feature text: "the server should expose its connection and authentication details to all harnesses".
40a. The remote MCP endpoint requires a bearer token that `janus remote-serve` mints for itself on the far side — user answer: "Far side mints its own".
40b. The local server's persisted token never leaves the local machine — user answer: "The local server's persisted token never leaves this machine".
41. A detached remote session's harness has no access to Janissary commands through the MCP server — user answer: "dettached sessions will not have access to the janissary mcp".
41a. When the far side loses its link to the local side, for any reason, its in-flight MCP calls keep waiting for a 60-second grace window — user answer: "Hold with a grace window": "Any loss holds calls for a fixed grace (e.g. 60 s, the reconnect backoff's scale)".
41b. A link that returns within the grace window delivers every waiting call's answer to its harness — user answer: "Hold over reconnect": "in-flight and new calls wait and are re-sent once the link is back."
41c. A new call made during the grace window waits like an in-flight one — same user answer.
41d. When the grace window ends with no link, every waiting call fails with the tool error `Janissary is not connected.` — user answer: "If no link returns in time, they fail."
41e. A call made after the grace window has ended, while there is still no link, fails at once with `Janissary is not connected.` — user answer: "calls made while detached fail the same way at once."
41f. A deliberate Detach is not signalled to the far side; its calls fail when the grace window ends — user answer: "A Detach therefore fails calls after the grace rather than at once, and no protocol change is made to Detach."
41g. Once a link exists again (a reconnect or an Attach), new calls are relayed normally — follows from 35.

`mcp` command

42. An `mcp` command reports the server's state — user scope extra: "`mcp` status command".
43. While the server runs, `mcp` prints the key/value block `status: running`, `url: http://127.0.0.1:<port>/mcp`, `port: <port>`, `tools: question` — user answer: "Key/value block".
44. While the server is not running, `mcp` prints `status: not running` and `reason: <reason>` only — user answer: "status + reason".
45. The `mcp` command never prints the token — user scope extra: "without printing the token".

## Design decisions

- The `question` tool is an ordinary blocking MCP tool call whose result is the user's answer, not MCP elicitation. Elicitation renders in the harness's own UI, and the 2026-07-28 protocol revision removes the server-to-client request channel it uses. The tool callback awaits the existing `Questions.register` so queueing, notifications and cancellation behave as they already do. Sources: https://code.claude.com/docs/en/mcp.md, https://opencode.ai/docs/mcp-servers.md, https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.md, https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/
- Each harness is pointed at the server per launch, without writing the user's own harness config, and reads the bearer token from an environment variable rather than argv: claude through `--mcp-config` inline JSON with `${VAR}` expansion (no `--strict-mcp-config`, which would drop the user's own servers), codex through per-server dotted `-c mcp_servers.janissary.*` keys (never a whole-table override), and opencode through its inline config layer, verified against the installed 2.x binary. The URL and token variables are added in `harnessEnv`/`harnessSpawnEnv`, so a remote launch builds its own copy on the far side as the browser variables already do. The token variable name avoids the `ANTHROPIC_*` prefix that claude blanks in headers. Sources: https://code.claude.com/docs/en/cli-reference, https://code.claude.com/docs/en/mcp.md, https://learn.chatgpt.com/docs/config-file/config-advanced, https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli, https://opencode.ai/v1/docs/config/, https://opencode.ai/docs/mcp-servers.md, https://github.com/pingdotgg/t3code/issues/15828
- Each harness's MCP tool timeout is raised per server at launch so a question waiting on a human is not abandoned (codex `tool_timeout_sec` defaults to 60 s; claude aborts an HTTP call idle for 5 minutes and moves a call running past 2 minutes to the background; opencode's execution timeout defaults to 12 h). This is done with launch settings alone: claude's idle abort and auto-background are switched off through its two environment variables, so the server needs no progress-heartbeat code. If a harness version is found to abort idle calls regardless of its timeout setting, the upgrade path is a periodic progress notification in `src/mcp/handler.ts`. Sources: https://code.claude.com/docs/en/mcp.md, https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli, https://opencode.ai/docs/mcp-servers.md, https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.md
- The MCP listener binds loopback only and serves plain HTTP behind a guard that refuses a present-but-wrong Origin, requires the bearer token in the `Authorization` header, and rejects a non-JSON POST. It reuses `originAllowed` and `tokenMatches` from `src/security.ts`, adds a header-reading token helper, and uses a credential separate from the application's session token, as `product/specs/harness.md` requires. The remote hop is encrypted by SSH, so no TLS is used (user answer: "Plain HTTP on loopback"). Sources: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.md, https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w, https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-transport-trust-gap-20261109-csa-style/, https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.md
- The MCP protocol layer is the official TypeScript SDK v2 — `@modelcontextprotocol/server@2.4.0` with `@modelcontextprotocol/node@2.1.2` (and their `@modelcontextprotocol/core`, `zod` ^4, `hono`, `@hono/node-server` dependencies) — using the stateless `createMcpHandler(() => createServer())` wrapped by `toNodeHandler()` behind Janissary's own guard on a `node:http` server; every new package version passes `check-malicious-package` before it is added. User answer: "Adopt SDK v2". Sources: https://github.com/modelcontextprotocol/typescript-sdk/releases, https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.md, https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.md, https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/
- A remote harness's MCP server is a far-side endpoint inside `janus remote-serve`, serving the same `question` tool over the same SDK handler on the remote host's loopback. Its tool callback does not answer locally: it relays each call to the local Janissary as a new request frame on the session's existing framed protocol, and the local side runs it through the same `question` path a local call uses and answers with a correlated result frame. No SSH port forward is used, so no remote port or socket has to be named before ssh connects. User answer: "the mcp server could be remote but pass commands back to the local machine for execution." Precedent: correlated request/reply over the live channel, as `harness capture` already does (`product/specs/remote-server.md` § Detached-session auto-accept, notifications, and captures: "Each capture request carries a correlation id").

- MCP code is a new core subsystem under `src/mcp/`: the request guard, the SDK handler factory, and a tool registry in which each tool is declared once with its input schema (today only `question`). The local process owns a `managers.mcp` manager that starts the server and executes tools; `janus remote-serve` mounts the same handler factory with an executor that relays each call to the local side instead. Exposing another Janissary command later is one registry entry. User answer: "New core `src/mcp/` + tool registry".
- The relay uses two new remote frames modelled on the existing `acp-tool-request` / `acp-tool-result` pair: a far-side `mcp-call` carrying a correlation id, the tool name and its arguments, and a local `mcp-result` echoing that id with the text result or an error. Adding them bumps the remote protocol version, as every new frame does. Precedent: `src/remote/protocol-frames.ts:307` "`type: 'acp-tool-request'; id: string; request: number; command: string`".

## Preserved behavior

1. ACP agent `question ask` / `question approve` commands still parse and register for the issuing tab, and malformed input still returns usage text. Negative assertion: the MCP path must not change the command parser's accepted grammar, and must not register a malformed command. Test: `src/question-command.test.ts` "registers a valid command for the issuing tab".
2. A second question on a tab stays queued until the first resolves. Negative assertion: an MCP question must not replace or show alongside a tab's active question. Test: `src/questions.test.ts` "holds a second question until the first resolves".
3. Closing a tab resolves its active and queued questions to `Question cancelled.` Negative assertion: an MCP caller's question must not stay pending after its tab closes. Test: `src/questions.test.ts` "resolves active and queued questions when their tab closes".
4. A question on the already-active tab records no `Question from <tab>` notification. Negative assertion: the new unread marking must not add a notification or an unread flag for the focused tab. Test: `src/controller/create-managers.test.ts` "does not notify when the question is pending for the already-active tab".
5. A docked tab never gets the unread flag. Negative assertion: question unread marking must not set `hasUnread` on a docked tab. Test: `src/tab/manager.test.ts` "append does not mark a docked, non-active tab unread".
6. A claude launch still carries `CLAUDE_CODE_TMPDIR` and `DISABLE_AUTOUPDATER`. Negative assertion: adding MCP variables must not drop or overwrite claude's existing overrides. Test: `src/harness/scratch-dir.test.ts` "returns claude's own overrides and no handle".

## Assumptions

1. A question is registered against a tab label and resolves to the answer or `Question cancelled.` — `src/questions.ts:25` "`register(request: QuestionRequest, signal?: AbortSignal): Promise<string>`".
2. The live application's URL and session token are deliberately not given to harnesses — `product/specs/harness.md:290` "Janissary does not inject the live application's URL or session token".
3. Supported harnesses are claude, opencode and codex — `product/specs/harness.md:13` "`harness <claude|opencode|codex>`".
4. A deliberate Detach gives the far side no signal, so it sees the same thing as a lost connection — `product/specs/remote-server.md:559` "drops the transport without telling the peer anything".
5. A remote harness's launch command is built locally and shipped in the `spawn` frame, while its environment is built on the far side — `src/harness/tab-spawn.ts:85` "`const command = buildHarnessCommand(name, model, effort);`" and `src/remote/serve-processes.ts:109` "`harnessSpawnEnv({`".
6. Unread marking already refuses the active tab, the other pane's visible tab, and docked tabs — `src/tab/transcript/events.ts:102` "`if (!tab || !isUnreadEligible(tab, label, activeLabel, secondaryLabel)) return false;`".
7. Remote frames from local to far are "client frames" and frames from far to local are "server frames", each with a base64 field table — `src/remote/base64-fields.ts` "`// Server frames.`".

## Existing functionality

1. Per-tab question queue with cancellation — `src/questions.ts:25` "`register(`".
2. `question ask` / `question approve` parsing and usage text — `src/question-command.ts:31` "`parseQuestionCommand`".
3. Pending-question change hook that dirties state and records the `Question from <tab>` notification — `src/controller/create-managers.ts:59` "`managers.questions = new Questions(`".
4. Question panel rendered for the current tab, harness tabs included — `web/src/MountedViewLayers.tsx:153` "`current?.pendingQuestion && <QuestionPanel`".
5. Unread marking for a tab label — `src/tab/manager.ts:154` "`markUnread(label: string): boolean`".
6. Token minting, origin check and constant-time token comparison — `src/security.ts:5` "`export function makeToken()`", `src/security.ts:16` "`originAllowed`", `src/security.ts:40` "`tokenMatches`".
7. Harness spawn environment built on the host the harness runs on, local and remote — `src/harness/scratch-dir.ts:42` "`harnessSpawnEnv`", called from `src/harness/tab-spawn.ts:91` and `src/remote/serve-processes.ts:109`.
8. Harness launch command builder with per-harness launch args — `src/harness/index.ts:45` "`buildHarnessCommand`".
9. Remote session `ssh` command builder — `src/remote/entry-factory.ts:42` "`sshRemoteCommand`".
10. Metadata-row flag registry — `web/src/shared/tab/flag-display.ts` "`tabFlagDisplay`".
11. Server-side flag derivation with a launch/in-use pair — `src/tab/view.ts:253` "`function browserFlag(tab: Tab): string[]`".
12. Label-or-alias tab lookup — `src/tab/lookup.ts:25` "`export function byLabelOrAlias(`".
13. Atomic file writes with a create mode — `src/atomic-write.ts:9` "`export function atomicWriteFile(`".
14. Correlated far-side request / local result frames — `src/remote/protocol-frames.ts:307` "`type: 'acp-tool-request'`" and `src/remote/protocol-frames.ts:192` "`type: 'acp-tool-result'`".
15. Remote protocol version constant — `src/remote/protocol.ts:272` "`export const REMOTE_PROTOCOL_VERSION = 48;`".
16. Terminal refocus helper for the current tab — `web/src/useFocusOnTabSwitch.ts:8` "`export function focusCenterVisibleTab(`".
17. Dialog checkbox enable rule driven by another field — `web/src/harness/HarnessLaunchDialog.tsx:93` "`harness-launch-check${autoResumeEnabled ? '' : ' disabled'}`".
18. Command module shape and help page — `src/commands/question.ts` "`export const command: Command = {`", `help/question.md`.

## Implementation steps

Each step leaves the tree green. Build and check every step with `$janissary/scripts/run.mjs check-diff`. Keep every touched file under the 200-line `max-lines` limit by extracting a new module, never by compacting; files already near it are called out below.

1. **Unread for every question.** In the `Questions` change callback at `src/controller/create-managers.ts:59`, when `pending` is set and the tab is not the current tab, call `managers.tab.markUnread(label)` beside the existing `notify(managers, 'question', …)`. `markUnread` already refuses docked tabs. Update `product/specs/agent-questions.md` § Notifications to say the tab is also marked unread. Covers requirements 25–27.

2. **Dependencies.** Run `$janissary/scripts/run.mjs check-malicious-package @modelcontextprotocol/server@2.4.0 @modelcontextprotocol/node@2.1.2 @modelcontextprotocol/core@2.4.0` and do not add a version that exits non-zero. Then add `@modelcontextprotocol/server` and `@modelcontextprotocol/node` to `dependencies`, and run `$janissary/scripts/run.mjs check-malicious-package --audit ./package-lock.json`. First confirm with a ten-line spike that `toNodeHandler(createMcpHandler(…))` serves a request when given to `node:http` `createServer` directly, because the SDK docs show it only in framework form. If it does not, mount it through `@hono/node-server`'s `getRequestListener` instead; both are already in the SDK's dependency tree.

3. **`src/mcp/` core, with no listener yet.**
   - `src/mcp/tools.ts`: the tool registry, a read-only list of tool definitions (name, description, input schema) plus the executor contract. An executor receives the tool name, the validated arguments, and an `AbortSignal`, and resolves to `{ text, isError }`.
   - `src/mcp/question-tool.ts`: the `question` definition. Its validation produces exactly the four requirement-21 texts and runs before any executor is called.
   - `src/mcp/handler.ts`: builds the SDK handler from the registry and an executor, registering every registry entry with `createMcpHandler(() => createServer())`. It passes the request's abort signal to the executor. It sends no progress heartbeats: step 5's per-harness timeout settings are what keep a call waiting on a human alive.
   - `src/mcp/guard.ts`: wraps the handler. It answers `403` for a present Origin that `originAllowed` (`src/security.ts:16`) rejects, `401` when the `Authorization: Bearer` token fails `tokenMatches` (`src/security.ts:40`), and `415` for a POST whose content type is not `application/json`.
   - `src/security.ts`: gains a `bearerToken(request)` helper beside `tokenFromReq`.

   Nothing calls these modules yet.

4. **Local server and manager.** `src/mcp/manager.ts` reads and writes `.janissary/mcp.json` (`{ port, token }`) through `atomicWriteFile` (`src/atomic-write.ts:9`) with file mode `0o600`. It mints the token with `makeToken` (`src/security.ts:5`) and picks a port by listening on `127.0.0.1:0` on first start.

   `src/config.ts` gains an optional `mcpPort` key, which overrides the saved port. Decode it in `src/config-decode.ts`: an integer from 1 to 65535 is used, and any other value is treated as absent, so the saved port applies. Unlike the keys `backfillMissingKeys` writes out, it is not written into a fresh config. Record it in `product/specs/application-config.md`.

   `src/mcp/manager.ts` (`McpManager`) starts a `node:http` server on `127.0.0.1:<port>` serving the guard at path `/mcp`. It exposes:
   - `status()`, giving running with url and port, or not running with a reason;
   - `localLaunch()`, giving `{ url, token }` or `undefined` while not running;
   - `dispose()`, which closes the listener.

   On a listen or state-file failure it records one notification of the new kind `mcp-failed` with the text `MCP server failed to start: <reason>`. That needs a new member in the notification kind union at `src/notifications/index.ts:24` and a `case` in `src/notifications/format.ts` returning `detail`.

   The local executor resolves `tab` with `byLabelOrAlias` (`src/tab/lookup.ts:25`), returning `No tab named "<tab>".` when nothing matches. It sets a new `mcpUsed` field on the matched `Tab` (`src/tab/types.ts`, beside `browserRunning`) and emits a dirty state. It then awaits `managers.questions.register({ tab: tab.label, kind, question, options }, signal)` and returns the answer as text.

   When the caller's signal aborts while the question is still registered, the executor records a notification of the new kind `question-withdrawn`, formatted `Question from <tab> withdrawn`. This is the only path that records it: a tab close or a user Cancel resolves without the caller's signal aborting.

   Register `mcp` in `Managers` (`src/managers.ts`) and in `MANAGER_DISPOSE_ORDER` ahead of `questions`, so the listener stops before questions are cancelled. Construct it in `createManagers` after `questions`.

5. **Local harness injection.**
   - `src/harness/command-parse.ts` parses `--no-mcp` into a new `mcp` boolean beside `browser` (`src/harness/command-parse.ts:121` "`const browser = tokens.every(`"). The file counts 126 lines toward `max-lines`, so it needs no extraction.
   - The effective `mcp` is false when `--no-mcp` or `--offline` is present, or when `McpManager.localLaunch()` is `undefined`.
   - `src/harness/mcp-args.ts` builds the per-harness launch fragment from the server name `janissary` and the environment variable names, never a literal token:
     - claude: `--mcp-config` inline JSON with a `type: "http"` server whose `url` is `${JANISSARY_MCP_URL}`, an `Authorization: Bearer ${JANISSARY_MCP_TOKEN}` header, and a 7-day `timeout`. Never pass `--strict-mcp-config`.
     - codex: `-c mcp_servers.janissary.url=…`, `-c mcp_servers.janissary.bearer_token_env_var="JANISSARY_MCP_TOKEN"` and `-c mcp_servers.janissary.tool_timeout_sec=604800`.
     - opencode: the inline config layer, checked against the installed 2.x binary's `--help`/docs at implementation time, with `{env:JANISSARY_MCP_TOKEN}` in the header, `oauth: false`, and a 7-day `timeout.execution`.
   - `buildHarnessCommand` (`src/harness/index.ts:45`) gains an optional `mcp` argument and appends that fragment. The token reference is always single-quoted with `shellQuote` (as `effortArg` does at `src/harness/index.ts:19`), so the launching shell leaves it unexpanded for the harness to read from its own environment, and the token never appears in argv. The URL is not secret, and it differs per host: a remote harness's URL names the far side's port, which the locally built command cannot know. So where a harness does not expand environment references in its URL itself (codex's `-c mcp_servers.janissary.url`), the fragment double-quotes `$JANISSARY_MCP_URL` for the launching shell to expand from the spawn environment on the host that runs it.
   - `harnessSpawnEnv` (`src/harness/scratch-dir.ts:42`) gains an optional `mcp: { url, token }` option, merged after the existing claude and browser variables, adding `JANISSARY_TAB`, `JANISSARY_MCP_URL` and `JANISSARY_MCP_TOKEN`. For claude it also sets `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`, so the call is not moved to the background, and `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0`, so claude's 5-minute idle abort does not fire.
   - `src/harness/tab-spawn.ts` passes the effective `mcp` and sets `tab.mcp` (a new `Tab` field beside `browser`, `src/tab/types.ts:440`).

6. **Metadata flag and focus return (web).**
   - An `mcpFlag` function in `src/tab/view.ts`, beside `browserFlag` (`src/tab/view.ts:253`) and added to the same flag list, derives `['mcpInUse']` when `tab.mcpUsed`, `['mcp']` when `tab.mcp`, and nothing otherwise. The file counts 187 lines toward `max-lines`, so the few added lines fit.
   - `web/src/shared/icons.ts` exports `faServer as mcpIcon`.
   - `web/src/shared/tab/flag-display.ts` adds `mcp: { icon: mcpIcon, label: 'MCP server' }` and `mcpInUse: { icon: mcpIcon, label: 'MCP server in use', className: 'tab-flag--active' }`.
   - Update the flag-name comment at `src/protocol/tab.ts:102`.
   - Add `web/src/useQuestionFocusReturn.ts` as described in UI design 2a.

7. **New harness dialog.** `web/src/harness/harness-launch-selection.ts` gains an `mcp` field, initially `true`. When `offline` becomes true it sets `mcp` false and marks it disabled, and it re-enables it when `offline` clears, following the `autoResumeSupported` pattern. `web/src/harness/harness-launch-command.ts` appends `--no-mcp` when `mcp` is false and `offline` is false. `web/src/harness/HarnessLaunchDialog.tsx` renders an **MCP server (--no-mcp to disable)** checkbox directly after the **E2E browser (-b)** label (`web/src/harness/HarnessLaunchDialog.tsx:81`).

8. **`mcp` command.** `src/commands/mcp.ts` registers `mcp` in the command table (the same shape as `src/commands/question.ts`). It prints either the four running lines `status: running`, `url: http://127.0.0.1:<port>/mcp`, `port: <port>`, `tools: question`, or the two lines `status: not running` and `reason: <reason>`. The token never appears. Add `help/mcp.md` and list `mcp` in `help/commands.md`.

9. **Remote relay.**
   - Bump `REMOTE_PROTOCOL_VERSION` (`src/remote/protocol.ts:272`) to 49 and add a `Protocol version 49` paragraph to `product/specs/remote-server.md`.
   - In `src/remote/protocol-frames.ts`, the `spawn` client frame gains `mcp?: boolean` beside `browser?: boolean` (`src/remote/protocol-frames.ts:141`).
   - A new far-side frame `mcp-call` carries `{ call: string; tool: string; args: string }`, with `args` as base64 JSON registered in `src/remote/base64-fields.ts`. A new client frame `mcp-result` carries `{ call: string; text: string; isError: boolean }`, with `text` as base64. Add both to the frame-name tables at `src/remote/protocol-frames.ts:358` and `:367`. The file counts 189 lines toward `max-lines`; if the additions push it past 200, move the two new frame types into `src/remote/protocol-frames-mcp.ts` and union them in.
   - Far side: `src/remote/serve-mcp.ts` lazily starts one endpoint per `remote-serve` process on the first `spawn` with `mcp: true`. It mints its own token, listens on `127.0.0.1:0`, uses the same guard and handler, and keeps both for the process's life, so they survive a detach. `src/remote/serve-processes.ts` passes `{ url, token }` from it into `harnessSpawnEnv` (`src/remote/serve-processes.ts:109`). The launch command itself is built locally and shipped in the `spawn` frame's `command` (`src/harness/tab-spawn.ts:85` "`const command = buildHarnessCommand(name, model, effort);`"), and the step-5 fragment names only environment variables, so the same fragment works on the far side unchanged.
   - The relaying executor keeps a pending map keyed by a fresh `call` id. It sends `mcp-call` while a link exists, otherwise holds the call. On link loss it starts one 60-second grace timer. When the link returns before the timer fires, it re-sends every pending call. When the timer fires, it fails each pending call with `Janissary is not connected.` and fails later calls at once until a link returns. A caller abort removes its entry and sends nothing further.
   - Local side: `src/remote/mcp-relay.ts` handles `mcp-call` by running the same local executor as step 4. It keeps a per-channel map from `call` id to the in-flight promise or settled result, so a re-sent call attaches to the existing question rather than registering a second one. It sends `mcp-result` when the promise settles, or when a re-sent call finds a settled result. The map is cleared when the channel closes.
   - The local launch path (`src/harness/tab-spawn.ts:100` "`registerRemotePty(label, channel, { program, command, harness: name, offline, browser, …`") adds `mcp` to that spawn options object and builds no local MCP variables for a remote launch, just as it builds no local browser for one. The effective `mcp` for a remote launch follows the same step-5 rule, so a local server that is not running gives a remote harness no MCP either (requirement 34).
   - A detach closes the local tab, which cancels its question through `Questions.closeTab`, and the channel-close clears the relay map. A call the far side re-sends after an Attach within the grace window therefore registers afresh and opens the panel on the rebuilt tab.

10. **Specs.** Add `product/specs/mcp-server.md` covering the server, the tool, its errors, persistence, `mcpPort`, the `mcp` command, harness injection, and the remote relay with its grace window. Update:
    - `product/specs/harness.md`: the command grammar with `--no-mcp`, the New harness dialog's **MCP server** checkbox, and the injected variables;
    - `product/specs/tabs.md` § Metadata row: the MCP flag;
    - `product/specs/agent-questions.md`: MCP as a question source, the withdrawn notification, and focus return on harness tabs. Also replace its "There is no shell command, external HTTP endpoint, timeout, or caller-supplied default" sentence with one that names the MCP endpoint;
    - `product/specs/notifications.md`: the `mcp-failed` and `question-withdrawn` kinds;
    - `product/specs/remote-server.md`: the relay and the grace window.

## UI design

1. The feature reuses the existing non-modal question panel (`web/src/shared/questions/QuestionPanel.tsx`) on the named tab, rendered by `web/src/MountedViewLayers.tsx` for the current tab.
2. A question panel opening on a harness tab takes keyboard focus by the existing rule (Cancel for `approve`, the text field for `ask`) — user answer: "Same as today". This is existing behavior in `web/src/shared/questions/QuestionPanel.tsx:21` "`if (question.kind === 'approve') cancelRef.current?.focus();`".
2a. When the current harness tab's question resolves (answered, cancelled, or withdrawn) while keyboard focus is inside the panel, focus returns to that harness tab's terminal — user answer: "Escape/Cancel returns focus to the terminal." This is new behavior: nothing restores focus today. It goes in a new hook `web/src/useQuestionFocusReturn.ts`, called from `web/src/App.tsx` beside `useFocusOnTabSwitch` (`web/src/App.tsx:190`) with the same `currentRef` and `harnessHandles` arguments. When the current tab is a harness tab (`view === 'harness'`) and its `pendingQuestion` goes from present to absent while `document.activeElement` is `document.body` (the unmounted panel held focus), the hook calls the existing `focusCenterVisibleTab` (`web/src/useFocusOnTabSwitch.ts:8` "`export function focusCenterVisibleTab(`"), which focuses the terminal through the `harnessHandles` map keyed by `harness.ptyId`. Focus that is anywhere else at that moment, such as the other pane's command line, is left where it is.
3. The unread flag is the existing tab-strip unread badge (`product/specs/tabs.md` § Unread badge).
4. A harness tab launched with MCP config shows an MCP flag in its metadata row — user scope extra: "Metadata-row MCP icon".
5. The MCP flag has two states in `tabFlagDisplay`: plain `mcp` (tooltip "MCP server") from launch until the harness first calls the server, then green `mcpInUse` (tooltip "MCP server in use", `tab-flag--active`) for the rest of the tab's life — user answer: "Plain, green once used", the browser/browserInUse shape.
6. The MCP flag uses the `faServer` glyph, exported from `web/src/shared/icons.ts` beside the other flag icons — user answer: "faServer".
7. The New harness dialog gains an **MCP server** checkbox after **E2E browser**, checked by default; unchecking it adds `--no-mcp` to the built command — user scope extra: "New harness dialog toggle"; user answer: "Checked; off+disabled w/ Offline".
8. Checking **Offline** clears and disables **MCP server**, and unchecking **Offline** re-enables it, following the Auto-resume enable rule — user answer: "Checking **Offline** clears and disables it, and unchecking Offline re-enables it".
9. The feature adds no key bindings.
10. The MCP flag keeps its `mcp` / `mcpInUse` state while a remote tab reconnects; the existing connection plug shows the reconnect, and a pending question panel stays up as usual — user answer: "No change".

## Tests

- `src/controller/create-managers.test.ts`: a question pending on a background tab marks it unread and still notifies; a focused tab is neither marked nor notified (requirements 25–27).
- `src/mcp/question-tool.test.ts`: each of the four requirement-21 error texts, and a valid `ask` and `approve` passing validation (requirements 14, 20, 21).
- `src/mcp/guard.test.ts`: a wrong Origin gets 403, a missing or wrong bearer token gets 401, a non-JSON POST gets 415, and a valid request reaches the handler (requirements 4, 5).
- `src/mcp/manager.test.ts`, using a real loopback listener (the `src/http-test-fixture.ts` pattern; skip when loopback bind or connect is denied, like the existing socket suites):
  - the first start writes `.janissary/mcp.json` with mode `0o600`, and a second start reuses its port and token (requirements 6–8);
  - `mcpPort` overrides the saved port (requirement 9);
  - a taken port records one `mcp-failed` notification and leaves `localLaunch()` undefined (requirements 10–12, 34);
  - a `tools/list` call returns exactly `question` (requirement 13);
  - a `tools/call` on an open tab resolves with the panel's answer (requirements 15, 17), and a Cancel returns `Question cancelled.` (requirement 18);
  - an unknown tab returns `No tab named "x".` with no question registered (requirement 19);
  - an aborted call withdraws the question, shows the next queued one, and records `Question from <tab> withdrawn` (requirements 22–24).
- `src/harness/mcp-args.test.ts`: the fragment for each of claude, codex and opencode names `janissary`, carries no literal token, carries the timeout, and never contains `--strict-mcp-config` (requirements 28, 29).
- `src/harness/scratch-dir.test.ts`: the three MCP variables are present with the `mcp` option and merge beside `CLAUDE_CODE_TMPDIR`, and are absent without it (requirements 30, 31).
- `src/harness/command-parse.test.ts`: `--no-mcp` and `--offline` each give `mcp: false` (requirements 32, 33).
- `src/tab/view.test.ts`, beside the `browserInUse` cases: no flag without `tab.mcp`, `mcp` at launch, `mcpInUse` after use (UI design 4, 5).
- `web/src/harness/HarnessLaunchDialog.test.tsx`: **MCP server** starts checked, unchecking it adds `--no-mcp`, and checking **Offline** clears and disables it, while unchecking Offline re-enables it (UI design 7, 8).
- `web/src/useQuestionFocusReturn.test.ts`: a resolved question on the current harness tab focuses its terminal when focus was in the panel, and leaves focus alone otherwise (UI design 2a).
- `src/commands/mcp.test.ts`: the running and not-running blocks, and the token never appearing in either (requirements 42–45).
- `src/remote/serve-mcp.test.ts`, with a fake send and fake timers:
  - a call is relayed as `mcp-call` and settles on `mcp-result` (requirements 36–38);
  - a link lost and back within 60 s re-sends and settles (requirements 41a–41c);
  - a grace expiry fails pending calls with `Janissary is not connected.`, and fails a later call at once (requirements 41d–41f);
  - the far-side token differs from any value in the spawn frame (requirements 40a, 40b).
- `src/remote/mcp-relay.test.ts`: a re-sent `call` id attaches to the existing question rather than registering a second, and a settled id answers from the stored result (requirement 41b).
- `src/remote/protocol.test.ts`: the version is 49, and `mcp-call` / `mcp-result` round-trip with their base64 fields.

## Out of scope

- Exposing any Janissary command other than `question` — feature text: "limited to just one command `question` at the moment."
- MCP access for a detached remote session, and any automatic reattach when a detached harness asks a question — user answer: "dettached sessions will not have access to the janissary mcp."
- Network-facing HTTPS, a TLS certificate, and an `mcpHost` override — superseded by the user's decision to keep remote traffic on the session's own connection.
- SSH port forwarding (`ssh -R`) and Unix-socket relays — superseded by a far-side MCP endpoint that relays commands in band. User answer: "lets simplify, without being restricted to ssh tunnels".
- Binding a token to a tab — user answer: "Env label + shared token".

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Then check against the running app:

1. Start the app and type `mcp`. Expect `status: running`, a `url: http://127.0.0.1:<port>/mcp` line, `port:` and `tools: question`, with no token. A failure looks like `status: not running` with a `reason:`.
2. Open `harness claude as asker` and switch to another tab. In the claude tab, ask it: "use the janissary question tool to ask me 'Ship it?' with options yes and no, on tab $JANISSARY_TAB". Expect the `asker` tab to get the unread flag and a `Question from asker` notification. Its metadata row's server flag turns green. Switching to `asker` shows the approval panel with **yes**, **no** and **Cancel**, focus on Cancel. Clicking **yes** returns `yes` to claude, and focus lands back in the terminal. A failure looks like claude answering in its own UI, a timeout error, or no panel appearing.
3. Repeat with `harness codex`, and with `harness opencode`. Leave the question unanswered for more than two minutes before answering, to confirm neither harness abandons or backgrounds the call.
4. Open `harness claude as off --offline`, then open the New harness dialog. In the `off` tab, claude's `/mcp` lists no `janissary` server. In the dialog, checking **Offline** clears and disables **MCP server**.
5. On a remote host, run `harness claude as far on <host>` and repeat step 2's question. The panel opens on the local `far` tab, and the answer returns to the remote claude. Then ask again, Detach the session from the Sessions tab, and Attach it within a minute: the panel reappears on the rebuilt `far` tab, and answering it returns to claude. Detach again and wait past 60 seconds: the pending call fails in claude with `Janissary is not connected.`
