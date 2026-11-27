# MCP server

Janissary runs a local-only MCP server so AI harnesses can put a question to the human through Janissary's own question panel instead of through the harness's UI. The server is intended to grow into exposing every Janissary command, but today it exposes exactly one, `question` (see [[agent-questions]]).

### Server

The server runs inside the main Janissary process, listens on loopback only, and serves plain HTTP with no TLS certificate. Every request must carry the server's bearer token; one server-wide token authenticates every harness. That token is a credential of its own, separate from the application's live URL and session token, which harnesses are never given (see [[harness]]). A request with a missing or wrong token is refused, as is a request whose `Origin` is rejected or whose POST body is not JSON.

On its first start in a project the server picks a free loopback port below the band the sandbox denies to confined harnesses, so workspaced harnesses can always reach it, and saves it beside the token under `.janissary/`; every later start reuses both. A hand-edited `mcpPort` key overrides the saved port (see [[application-config]]) and is never saved itself. A first start under an override saves only the token, so the first later start without the override picks a reachable port as above and saves it beside that token. Whichever way the port was chosen, freshly picked, reused, or overridden, the server holds it in the same reservation as browser guards for as long as it listens, so a `-b` harness's guard is never handed the port the server is listening on; the port goes back to the pool when the server stops or fails to start. A port that is already taken stops the server from starting while Janissary itself runs normally, and records one notification reading `MCP server failed to start: <reason>`, with the failure reason verbatim (see [[notifications]]).

### The `question` tool

The server advertises exactly one tool, `question`. It accepts `tab`, `kind` (`ask` or `approve`), `question`, and, for `approve`, `options`. The question opens on the tab named by `tab`, which may be any open tab's label or alias: the token is not bound to a tab, and any authenticated caller can name any tab. The tool call blocks until the human answers and returns that answer as its text result; a **Cancel** in the panel returns `Question cancelled.`

Validation runs before a panel opens. Each failure returns an MCP tool error result with one of these exact texts and opens no panel:

- `No tab named "<tab>".` when no open tab has that name.
- `kind must be "ask" or "approve".` for an unknown kind.
- `question must not be empty.` for an empty question.
- `approve needs at least one option.` for an `approve` with no options.
- `options must be a list of strings.` when any option is not a string, for either kind.

A question raised on a tab that is not focused marks that tab unread and records `Question from <tab>` as well, just as an ACP agent's question does. The panel, its ordering, and those notifications are described in [[agent-questions]]; the unread badge is described in [[tabs]].

### Cancellation and withdrawal

An MCP cancellation or a closed connection from the calling harness aborts its registered question and withdraws the panel. The next queued question for that tab, if any, then appears. Withdrawal records a notification reading `Question from <tab> withdrawn` (see [[notifications]]). A question that was answered or cancelled by the human does not record it: only the caller's abandoned request withdraws a question. A remote harness's cancellation reaches the local side over the session, including one issued because the link stayed down past the grace window; a cancellation that arrives after the answer has no effect. When a question on the current harness tab resolves while focus was inside the panel, focus returns to that tab's terminal (see [[agent-questions]]).

### `mcp` command

`mcp` prints the server's state in the current transcript and never prints the token. While the server runs it prints exactly:

```
status: running
url: http://127.0.0.1:<port>/mcp
port: <port>
tools: question
```

While it is not running it prints only:

```
status: not running
reason: <reason>
```

### Harness launch

Every harness launched with MCP config lists the server under the name `janissary` and receives three variables: `JANISSARY_TAB` holds its own tab's label, `JANISSARY_MCP_URL` holds the server URL, and `JANISSARY_MCP_TOKEN` holds the bearer token. The token is read from the environment, never from argv, so it appears in neither the process list nor a transcript. Claude also gets `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` and `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0`, so a call waiting on a human stays in the foreground and is not abandoned after five idle minutes. The harness's launch settings give the question tool a week to wait, so no progress heartbeat is needed. See [[harness]] for the command flags, the New harness dialog's **MCP server** checkbox, and the terminal overrides.

A launch with `--no-mcp` or `--offline`, a launch while the server is not running, and a launch of a harness whose MCP is otherwise off receive neither the server fragment nor any of the three variables. A harness tab launched with MCP config shows a server flag in its metadata row, plain until the harness first calls the server and green with the tooltip "MCP server in use" thereafter (see [[tabs]]).

### Remote relay

A remote harness gets its MCP endpoint on the remote host, inside that session's `janus remote-serve`, without naming a remote port or setting up an ssh forward. The far side mints its own bearer token and gives that endpoint and token to the harness in its launch environment; the local server's persisted token never leaves the local machine. The endpoint's loopback port is drawn from the same harness-reachable range and the same reservation as the remote host's browser guards (`reserveReachablePort` in `src/browser/e2e-ports.ts`), and stays reserved until the endpoint is released, so a remote `-b` harness's guard is never handed the port the endpoint listens on. The endpoint serves the same `question` tool, but the call travels back to the local Janissary over the session's existing connection, where the question is put to the human and the answer returns to the remote harness. A remote harness can only run commands on the local process (see [[remote-server]]).

The local side checks every relayed call itself before it opens a panel, because it can't rely on the far side's validation. A call naming any tool other than `question` fails with the tool error `Unknown MCP tool "<tool>".`. A `question` call's arguments get the same validation, with the same exact texts, as a local call. That includes a non-string question, which fails with `question must not be empty.`, and a non-string `tab`, which is looked up as the empty name and fails with `No tab named "".`. A refused call opens no panel and claims no call id, so a later valid call with the same id is put to the human normally.

Calls hold through a lost link for a 60-second grace window, whatever the reason, and the window starts when the link drops even for a call already delivered to the local side and still waiting for an answer; a deliberate Detach gives the far side no signal, so it looks like any other link loss. A call made while the link is down waits like one already in flight. If the link returns inside the window, every waiting call is re-sent and answered; a re-sent call attaches to its existing question rather than opening a second one. If the window ends with no link, every waiting call fails with the tool error `Janissary is not connected.` and its local question is withdrawn, with the same panel, notification and next-question behavior as a harness cancellation. A call made after that fails at once with the same text until a link returns. A refused call is never sent over the session and leaves no question behind for a later attach. See [[remote-server]] for the frames and session lifecycle.
