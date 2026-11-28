# MCP server

Janissary runs a local-only MCP server so AI harnesses can put a question to the human through Janissary's own question panel instead of through the harness's UI. The server is intended to grow into exposing every Janissary command, but today it exposes exactly one, `question` (see [[agent-questions]]).

### Server

The server runs inside the main Janissary process, listens on loopback only, and serves plain HTTP with no TLS certificate. Every request must carry the server's bearer token; one server-wide token authenticates every harness. That token is a credential of its own, separate from the application's live URL and session token, which harnesses are never given (see [[harness]]). A request with a missing or wrong token is refused, as is a request whose `Origin` is rejected or whose POST body is not JSON. The server answers only the `/mcp` path, with or without a query string. A request for any other path gets `404 Not Found` before its token is checked. The far-side endpoint of a remote harness applies these same request rules (see [Remote relay](#remote-relay)).

On its first start in a project the server picks a free loopback port below the band the sandbox denies to confined harnesses, so workspaced harnesses can always reach it, and saves it beside the token under `.janissary/`; every later start reuses both. A hand-edited `mcpPort` key overrides the saved port (see [[application-config]]) and is never saved itself. A first start under an override saves only the token, so the first later start without the override picks a reachable port as above and saves it beside that token. Whichever way the port was chosen, freshly picked, reused, or overridden, the server holds it in the same reservation as browser guards for as long as it listens, so a `-b` harness's guard is never handed the port the server is listening on; the port goes back to the pool when the server stops or fails to start. A port that is already taken stops the server from starting while Janissary itself runs normally, and records one notification reading `MCP server failed to start: <reason>`, with the failure reason verbatim (see [[notifications]]).

The saved state file gives only its owner read and write permission (mode `0600`). Before the listener starts, Janissary applies that mode to valid saved state without changing the saved token or port. Any state it writes or replaces is saved with the same mode.

A saved state file that is broken also stops the server from starting, on every start, while Janissary itself runs normally. It records the same single notification, and `mcp` prints the same reason. The state file is `.janissary/mcp.json`, and `<path>` below is its full path. A file that isn't a JSON object, has no non-empty string token, or has a port that isn't a whole number from 1 to 65535 gives the reason `invalid MCP state file <path>; delete it and restart Janissary to replace it`. A file with a token and no port is valid saved state, as written on a first start under an override. A file that exists but can't be read gives `unreadable MCP state file <path> (<error>); delete it and restart Janissary to replace it`. A valid file whose permissions can't be secured gives `could not secure MCP state file <path> (<error>); delete it and restart Janissary to replace it`. Both reasons include the filesystem error verbatim. The server leaves the file as it found it and waits for a restart. Once the file is deleted, the next start behaves like a first start and saves a new file. A missing file is the ordinary first start.

### The `question` tool

The server advertises exactly one tool, `question`. It accepts `tab`, `kind` (`ask` or `approve`), `question`, and, for `approve`, `options`. The question opens on the tab named by `tab`, which may be any open tab's label or alias: the token is not bound to a tab, and any authenticated caller can name any tab. The tool call blocks until the human answers and returns that answer as its text result; a **Cancel** in the panel returns `Question cancelled.`

Validation runs before a panel opens. Each failure returns an MCP tool error result with one of these exact texts and opens no panel:

- `No tab named "<tab>".` when no open tab has that name.
- `kind must be "ask" or "approve".` for an unknown kind.
- `question must not be empty.` for an empty question.
- `approve needs at least one option.` for an `approve` with no options.

A call whose arguments don't match the tool's declared types, such as an option that isn't a string, never reaches those checks. The MCP layer refuses it first with its own input-validation tool error, whose text starts with `Input validation error:`, and opens no panel.

A question raised on a tab that is not focused marks that tab unread and records `Question from <tab>` as well, just as an ACP agent's question does. The panel, its ordering, and those notifications are described in [[agent-questions]]; the unread badge is described in [[tabs]].

### Cancellation and withdrawal

An MCP cancellation withdraws the pending question. Closing the HTTP connection to the local endpoint while its question is pending withdraws that caller's question. If the tab has another queued question, it appears and its caller can still receive the result on its own connection. Withdrawal records a notification reading `Question from <tab> withdrawn` (see [[notifications]]). Once the human answers or cancels from the panel, that result is final. A caller cancellation that arrives before the reply is sent still preserves the panel's result and produces no withdrawal. A remote harness's cancellation reaches the local side over the session, including one issued because the link stayed down past the grace window. When a question on the current harness tab resolves while focus was inside the panel, focus returns to that tab's terminal (see [[agent-questions]]).

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

The local side checks every relayed call itself before it opens a panel, because it can't rely on the far side's validation. A call naming any tool other than `question` fails with the tool error `Unknown MCP tool "<tool>".`. A `question` call's arguments get the same exact checks as a local call. The relay sees them without the MCP layer's type check, so it also answers type mismatches with its own texts. A non-string question fails with `question must not be empty.`. A non-string `tab` is looked up as the empty name and fails with `No tab named "".`. A list of options holding anything other than a string fails with `options must be a list of strings.`, for either kind. A refused call opens no panel and claims no call id, so a later valid call with the same id is put to the human normally.

An attached remote session can relay a question only while it has an online harness whose local launch record enabled MCP. Attach uses the saved launch decision so a question can be replayed while the harness tab is being rebuilt. An attached session without an eligible harness receives `MCP is not enabled for this remote session.` Cancellation can still reach questions that were accepted before the last eligible harness stopped.

After Attach, a restored remote harness can still address its own tab by the original `JANISSARY_TAB` value. The question opens on the rebuilt tab even if Attach adds a suffix to its label. If that rebuilt tab has closed and the session still has an eligible harness, the original name produces `No tab named "<tab>".` Other names still resolve by label or alias as usual.

Calls hold through a lost link for a 60-second grace window. It starts when the link drops, including when no call is pending. An intentional Detach follows the same rule. A call made during an outage has only the time remaining in that outage's window. If the link returns inside the window, every waiting call is re-sent immediately with its original identifier and can be answered. A re-sent call reuses any existing question. If the window ends with no link, every waiting call fails with the tool error `Janissary is not connected.` and its local question is withdrawn, with the same panel, notification and next-question behavior as a harness cancellation. A call made after that fails at once with the same text and leaves no question behind. Reconnecting ends the outage even if there are no calls, and the next loss starts a fresh window. See [[remote-server]] for the frames and session lifecycle.
