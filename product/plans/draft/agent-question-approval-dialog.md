# Agent question / approval dialog API

## Summary

Give an agent or script running inside a Janissary tab — a harness, an ACP agent, or a plain shell script in a workspace — a way to ask the human a question and block on the answer, surfaced as a dialog in Janissary that shows the agent asking. The mechanism is a pair of `janus` client subcommands: `janus ask "<question>"` for a free-text answer, and `janus approve "<question>" <option> [<option> …]` for a choice among named options. The subcommand connects to the running server, identifies the tab it is running in (via the `JANUS_AGENT_NAME` env var already injected into tab processes), registers a pending question, and blocks. Janissary renders a non-modal panel anchored to that tab (reusing the existing dialog components), and posts a `Question from <tab>` notification so the user notices when the tab isn't focused. When the user answers, the chosen option label or typed text is returned on the subcommand's stdout with exit code 0. If the user cancels or dismisses (or an optional `--timeout` elapses), the subcommand prints an empty string — or a caller-supplied `--default <value>` — and still exits 0, so the calling agent can always proceed; only a genuinely broken call (bad usage, no reachable server, no tab context) exits non-zero. Each tab has at most one pending question at a time; a second `ask`/`approve` from the same tab blocks until the first resolves.

## Design decisions

1. **Two subcommands, not one.** `janus ask "<question>"` collects free text; `janus approve "<question>" <option>…` collects a choice among the supplied option labels. They are distinct subcommands rather than one command that infers the shape from whether options were passed.

2. **Both surface the same underlying "pending question," differing only in answer shape.** `ask` renders a text input; `approve` renders one button per option. The server-side registry, tab correlation, blocking, notification, and cancel/timeout handling are identical for both; only the input control and the returned value differ (typed string vs chosen option label).

3. **The subcommands are foreground *client* calls to a running server, like `janus stop`.** `bin/janus.mjs` already treats `stop`, `--help`, and `--version` as foreground (attached) invocations distinct from the detaching server launch. `ask` and `approve` join that foreground set: they do not launch a server — they connect to one already running, block on the answer, print it, and exit.

4. **The server is reached over its existing HTTP server, token-gated, addressed by an injected env var.** The server already runs an HTTP+WebSocket listener (`src/index.ts`) and writes a token-gated URL to `.janissary/log/server.log`. Because a workspaced process is sandboxed and may not be able to read the root project's `.janissary/log`, inject the server's base URL and token into each tab process's environment (alongside the existing `JANUS_AGENT_NAME` set in `src/shell-manager.ts` and scrubbed/rebuilt in `src/sandbox`) as e.g. `JANUS_URL`. The subcommand reads `JANUS_URL` (falling back to `.janissary/log/server.log` when running unsandboxed) and posts the question to a new token-gated HTTP endpoint. The sandbox permits localhost network by default; under `--offline` it does not, so an offline workspace's call fails fast (a broken call — see Decision 9).

5. **The question is correlated to the invoking tab via `JANUS_AGENT_NAME`.** The subcommand sends the tab label from `JANUS_AGENT_NAME`; the server resolves it against `managers.tab`. A call with no tab context (env var unset) or an unresolvable label is a broken call, not a cancel.

6. **The dialog is a non-modal panel anchored to that tab, reusing existing dialog components.** It renders through the existing dialog shell components (`ConfirmDialogShell` / `ModalDialog` and the dialog keyboard hooks in `web/src`) but non-modally, so other tabs stay usable and other agents' questions never block the whole app. The panel is marked as the agent asking (the tab's identity and the question text), showing option buttons (`approve`) or a text input (`ask`).

7. **A `Question from <tab>` notification fires when the owning tab isn't focused.** Reusing the notification plumbing (`notify` in `src/notifications.ts`), a new notification event surfaces the pending question in the notifications tab with a link to the owning tab, on the same footing as the `auto-approve` event (always eligible, bypassing focus suppression, since it is an explicit agent action awaiting the user).

8. **Cancel and timeout return the default and exit 0.** On the user dismissing the panel, on an optional `--timeout <seconds>` elapsing, and on the owning tab closing while a question is pending, the subcommand prints the caller-supplied `--default <value>` (empty string if none) to stdout and exits 0. This lets the calling agent always make progress. Timeout is opt-in per call; with no `--timeout` the question waits until answered, cancelled, or the tab closes.

9. **Only a broken call exits non-zero.** Malformed usage (e.g. `approve` with no options), no reachable server, and no/unknown tab context write an error to stderr and exit non-zero. These are distinguishable from a cancel (Decision 8), which is a normal outcome.

10. **One pending question per tab; a second blocks server-side.** The registry allows at most one pending question per tab. A second `ask`/`approve` from the same tab is held (its HTTP call blocks) until the first is resolved, then its panel appears. This keeps the per-tab panel unambiguous without the caller needing to coordinate.

11. **Nothing is persisted.** A pending question is in-memory server state; it is not saved and not restored on `--relaunch`. A question pending when the server stops is simply lost (its blocked call ends when the connection drops).

## What already exists (reuse, don't rebuild)

| Concern | Existing mechanism to reuse |
| --- | --- |
| Foreground `janus` subcommands vs server launch | `bin/janus.mjs`'s `isForeground` handling of `stop`/`--help`/`--version`. |
| A running HTTP + WebSocket server and token gating | `src/index.ts` (`createServer`, `WebSocketServer`, the `/open/<id>` token-gated routes). |
| Tab identity injected into tab processes | `JANUS_AGENT_NAME` set in `src/shell-manager.ts`; the sandbox env rebuild in `src/sandbox/index.ts`. |
| Modal/confirm dialog UI and keyboard handling | `web/src/ConfirmDialogShell.tsx`, `web/src/ModalDialog.tsx`, `web/src/useDialogKeyboard.ts` / `web/src/useConfirmDialogKeys.ts`. |
| Notifications | `notify` and the event enum in `src/notifications.ts`; `src/notifications-tab.ts`. |
| Client ⇄ server RPC surface | the request/method union in `src/protocol.ts` and per-tab view fields. |
| Skill format | `skills/perplexity-search/SKILL.md` / `skills/agent-merge-changes/SKILL.md` (frontmatter + "When to use / How it works / Examples"). |
| Auto-approve as the inverse precedent | the harness auto-approve flow (`harness.md`) — Janissary answering an agent's prompt automatically; this feature is the human-answered counterpart. |

## Proposed changes

### CLI: `janus ask` and `janus approve` client subcommands

Add the two subcommands as foreground client calls. Because `bin/janus.mjs` is a thin launcher and the request/response logic (env resolution, HTTP call, blocking, default/timeout, exit codes) is non-trivial, put the client logic in a new small module under `src/` (e.g. `src/ask-client/`) invoked when the first argument is `ask` or `approve`, keeping `bin/janus.mjs` limited to dispatching to it in the foreground branch. The client resolves the server base URL and token from `JANUS_URL` (or `.janissary/log/server.log` when unsandboxed), reads the tab label from `JANUS_AGENT_NAME`, parses `--default <value>` and `--timeout <seconds>`, POSTs the question, blocks on the response, prints the answer (or the default on cancel/timeout) to stdout, and sets the exit code per Decisions 8–9. Update `src/cli-info.ts`'s help text to document both subcommands.

### Server: a question registry and token-gated HTTP endpoint

Add a new module (e.g. `src/questions/`) holding an in-memory registry keyed by tab label, each entry a pending `{ id, tab, kind, question, options?, resolve }`. Add a token-gated HTTP route to `src/index.ts`'s request handler (mirroring the `/open/<id>` token check) that accepts a POST carrying `{ tab, kind: 'ask' | 'approve', question, options?, default?, timeoutMs? }`: it validates the token, resolves the tab against `managers.tab` (400/404-style error → non-zero client exit), enforces one-pending-per-tab by waiting if the tab already has one (Decision 10), registers the pending question, pushes the updated tab view to connected clients, arms the optional timeout, and holds the HTTP response open until the question resolves (answer, cancel, timeout, or tab close), then responds with the resolved value. Closing the owning tab resolves any pending question as a cancel (Decision 8).

### Server: view field, answer RPC, and notification

Add a per-tab pending-question field to the tab view in `src/protocol.ts` (the question text, kind, and options), populated when a question is registered and cleared when resolved. Add a client→server RPC (e.g. `answerQuestion`) carrying the tab/id and the answer (typed text, chosen option label, or a cancel marker); its handler resolves the registry entry, which unblocks the held HTTP response. Add a new notification event (e.g. `question`) to the enum and text in `src/notifications.ts`, fired when a question is registered on a non-focused tab, formatted `Question from <tab>` with a link to the owning tab.

### Client: the non-modal question panel

Render the pending-question view field as a non-modal panel anchored to the owning tab, reusing `ConfirmDialogShell`/`ModalDialog` structure and the dialog keyboard hooks but without trapping global input. For `approve`, show one button per option; for `ask`, show a text input with a submit affordance; both offer a dismiss/cancel control. Answering or cancelling issues the `answerQuestion` RPC and clears the panel. The panel is marked to show the tab/agent is the one asking, and the question text is rendered verbatim.

### Skill and spec

Add `skills/ask-user/SKILL.md` following the existing skill format, documenting when to use `janus ask` / `janus approve`, the exit-code and default/timeout contract, and short examples. Add a new spec `product/specs/agent-questions.md` describing the subcommands, transport and env-var contract, the non-modal per-tab panel, one-pending-per-tab, the notification, and the cancel/timeout/tab-close/error semantics; cross-reference it from `harness.md` (near auto-approve) and `notifications.md`.

## Tests

- **Server, question registry** (colocated `.test.ts` beside `src/questions/`): registering a question exposes it on the tab view; answering resolves with the given value; cancelling resolves with the default; a timeout resolves with the default; closing the owning tab resolves pending questions as cancel; a second registration for the same tab is held until the first resolves (Decision 10).
- **Server, HTTP endpoint**: a bad token is rejected; an unknown/absent tab yields the broken-call error; a well-formed `ask` and `approve` round-trip through a fake client answering via the RPC. Follow the existing server test conventions used for the `/open/<id>` routes and monitor sessions.
- **CLI client** (`src/ask-client` colocated test): argument parsing for `ask`/`approve`, `--default`, `--timeout`; URL/token resolution from `JANUS_URL` and from `server.log`; missing `JANUS_AGENT_NAME` → non-zero; cancel/timeout prints the default and exits 0; a malformed `approve` (no options) → non-zero. Stub the HTTP call so no real server is needed.
- **Client, panel** (`web/src` colocated test, following the existing dialog component tests): `approve` renders option buttons and emits the chosen label; `ask` renders a text input and emits the typed text; the cancel control emits the cancel marker; the panel is non-modal (does not trap unrelated input).

## Out of scope

- **MCP or any generic tool-protocol integration** — this is a purpose-built CLI + HTTP endpoint, not MCP server support (consistent with the backlog note that this should be tooling around API calls, not MCP).
- **Rich input beyond free text and a flat option list** — no multi-field forms, file pickers, or nested/multi-select choices in this version.
- **Persisting or restoring pending questions across `--relaunch` or server restart** (Decision 11).
- **Reaching a server on another host** — the transport targets the local server the tab belongs to; no remote addressing.
- **Answering from outside Janissary** (e.g. answering via the CLI or an external channel) — the human answers in the Janissary UI panel or its notification link only.
- **Changing the existing auto-approve behavior** — that flow (Janissary answering agent permission prompts automatically) is untouched; this is a separate, human-answered channel.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each step (lints changed files, typechecks affected projects, runs server and web tests for the touched areas).
- Manual end-to-end: launch a workspaced harness tab, and from a shell inside it run `janus approve "Deploy to prod?" Yes No`; confirm a non-modal panel appears anchored to that tab showing the tab asking the question with Yes/No buttons, and a `Question from <tab>` notification appears when another tab is focused. Click `Yes` and confirm the shell command prints `Yes` and exits 0. Repeat with `janus ask "What port?"`, type an answer in the panel, and confirm it is printed to stdout. Dismiss a question and confirm the command prints the empty string (or the `--default` value) and exits 0. Run `janus ask` with the server stopped and confirm a non-zero exit with a stderr error. Fire a second `janus ask` from the same tab while one is pending and confirm its panel only appears after the first is answered.
