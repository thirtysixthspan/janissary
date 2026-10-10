# ACP

ACP is a core service for starting and querying Agent Client Protocol connections. Shell tabs use it through their command bar and a core streaming response panel. Any tab plugin can request the scoped core API without owning a terminal. Shell and harness tabs have no ACP command or prose route. Monitors, conversations, and editor queries retain their separate sessions over the shared protocol transport.

## Availability and plugin API

A plugin requests `startAcp`, `promptAcp`, and `resetAcp` in its declaration. Each capability is bound to that plugin's own answering tab, or its own invoking tab when there is no answering tab. It cannot start or query a different plugin's tab or a shell tab that invoked its command. An unavailable or disabled owner returns the ordinary request rejection `ACP tab is unavailable.`.

- `startAcp()` begins or reuses the tab's connection and returns `{ model }`, the identity of the session it began or reused, or `{ error }`. Startup is lazy and the handshake may still be pending. It takes an optional request: `startAcp({ withoutTools: true })` records that the tab's session runs without a tool table, so no browser, question, or database command can run on it and no reply line is recognized as one. The request belongs to the tab, so it holds for every prompt on that session and is forgotten only when the tab closes.
- `promptAcp(prompt)` runs the core database/browser/question loop and resolves with the final answer. Connection startup is automatic if needed. Provider and tool wait time belongs to core and is exempt from the plugin handler deadline.
- `promptAcpResult(prompt)` runs the same prompt and resolves with a result rather than a string: the reply and the session that produced it, or the reason there was none. A refusal resolves with a line of prose, so a caller handed one string cannot tell an answer from a refusal without reading its text.
- `resetAcp()` closes the connection and returns whether one existed. It settles in-flight requests and prevents obsolete callbacks from updating a replacement prompt.

A plugin requesting `promptAcp` supports the core `acp` and `acp reset` commands. The shell requests all three operations. A terminal, `spawnTerminal`, and `hostsCommandBar` are not prerequisites for the ACP API. The client publishes `useAcpResponse` through its plugin API; it returns only the owning tab's host-rendered response surface. Core owns protocol I/O, session lifecycle, tools, transcript state, Markdown rendering, reset controls, and tool-step controls. There is no ACP plugin.

## Commands

`acp <prompt>` queries the current supported tab's connection. Bare `acp` prints `Usage: acp <prompt>.`. `acp reset` ends that connection and reports `ACP session reset — next acp prompt will start fresh.`, or `No active ACP session to reset.`.

The shell's ordinary application-command dispatcher recognizes these commands and marks their replies as core-rendered. It waits for the ACP operation without duplicating the reply in zsh's terminal. Unclaimed shell-bar lines still go to zsh; use an explicit `acp` prefix to query the connection. See [[shell-tab]].


## Provider and model

The provider remains OpenCode, launched with `opencode acp`. It must be installed, authenticated, and on PATH. Model selection uses the harness catalog's OpenCode list, including project overrides. `google/gemini-3.1-flash-lite` is preferred while listed; otherwise the first available model is used. An empty list refuses the operation with `ACP: no opencode model is available in the harness catalog.`.

The session's configured provider/model appears in its connection row after the handshake. The shared ACP transport still denies native permission requests except where a separate consumer explicitly supplies its own allowlist.

## Connection lifecycle

`AcpSessionManager` in `src/acp/session-manager.ts` owns one connection per tab, starts it on demand, reuses it across prompts, and closes it on reset, tab closure, plugin failure, and shutdown. A local subprocess starts in the tab's working directory at connection creation; a workspaced tab passes its workspace and offline confinement to the existing sandbox. A changed directory does not replace an already-open conversation. See [[sandbox]].

`AcpManager` in `src/acp/manager.ts` owns prompt orchestration. An overlapping prompt is refused with `ACP: a prompt is already running.`, without cancelling the existing one. A reset or close settles a pending call with `ACP session closed.`. A fatal connection error is shown and the session is forgotten; the next prompt starts fresh. A prompt-level error leaves a viable session intact, including rate limits. Every one of those settles with a result saying which kind of line it is, so a caller that acts on what it is handed can tell a refusal from an answer.

A session carries an identity minted when it is created and forgotten when it is closed, and `startAcp` reports it beside the model. A caller that primed one session — a persona, a trust delimiter — compares it to learn that the session it is now talking to is a different one, because a replacement arrives with nothing the previous one was told.

New response identity and pending-request metadata are owned by the tab runtime. Core records ACP entries in the tab's existing transcript and tracks their identity without copying the text. Immutable running-entry replacements retain that identity. Responses are projected only for plugin tabs, through `TabView.acpResponse`, using the server's existing `flattenBuffer`. Other application-command entries do not appear in the ACP panel. Existing transcript limits and persistence behavior remain in force; no saved configuration, transcript, or profile is migrated or cleaned up.

## Streaming response panel

The core response panel sits above the shell command bar. It shows streamed, sanitized GitHub-flavored Markdown, tool steps, and a responding status while a prompt is active. It keeps previous ACP exchanges for the tab and follows new output while the user remains at the bottom. The shell's tab dot blinks during the operation.

The panel's **Reset ACP** control acts immediately on its owning tab, including while a shell-bar submission is still awaiting completion. Tool-step expansion uses the same server-owned collapse state, with an explicit tab label so a docked panel never changes another tab. File-link actions likewise run in the source tab. A plugin renders the core surface through the scoped client hook rather than implementing another response renderer.

Questions use the existing core question panel and answer protocol. A centre tab's question is shown when that tab is current. A selected docked shell also exposes its question through its scoped ACP surface; a hidden docked body does not raise one. The question's tab/id determine where the answer goes. See [[agent-questions]].

Reset or close aborts the current ACP request's question, whether active or queued, and preserves unrelated questions. An aborted loop does not issue another provider prompt after a tool returns. Calls without an abort signal retain the existing question lifecycle.

The connections panel retains the `acp:<provider/model>` row, close action, and transcript snapshot button. The snapshot uses the existing tab transcript; monitor and editor transcript scopes retain their own recorded exchanges. See [[connection]].

## Autonomous tool loop

Each user prompt receives the existing database, browser, and question primers plus the Markdown instruction. `runAcpToolLoop` in `src/acp/loop.ts` streams each turn, extracts the last recognized command line, runs it, and feeds the result back until there is a final answer or eight tool steps have run.

The tools are declared once in `src/acp/tool-table.ts`: browser, question, then database. Their order controls command ownership; extraction selects the reply's last recognized tool line. Fences and common prompt prefixes are tolerated. Only the final occurrence of an emitted command is removed from the displayed reply. A cold, empty first reply is retried once in the same transcript entry.

A session a plugin started with `withoutTools` builds no tool table at all. Its primer carries no tool text, no reply line is read as a command, and an emitted command has nothing that runs it — the loop answers with the reply as prose. Every other session, including a line typed at the `acp` command, runs the full table.

Tool results are recorded as ACP steps and collapse through the existing transcript rendering. The cap reports `(stopped after 8 tool steps)`. Arbitrary shell commands are not ACP tools. Database/browser/question execution remains on the machine running Janissary, even when the provider runs remotely.

## Remote connections

A remote shell or other remote plugin tab uses its existing channel and workspace for the ACP agent. The local side chooses the model and sends the launch request; the remote hosts the ACP client, so prompts and chunks cross SSH instead of JSON-RPC. Tabs sharing one channel still have independent ACP session ids.

Before the channel is attached, the operation refuses with `ACP: the remote session is still connecting.`. A dropped channel tears down its tab and connection. Late chunks from a reset or closed session cannot update its replacement. The existing remote platform confinement rules remain unchanged. Remote shell tabs offer ACP through their command bar; harness tabs remain terminal surfaces. See [[remote-server]].

## Errors and notifications

Fatal errors are shown as `ACP: <message>` and forget the connection. Existing bounded stderr details remain available: the last 2000 characters, restricted to the last ten lines. Prompt errors appear as `ACP error: <message>` in the response entry. Existing start, state-change, and rate-limit notification events remain in use.

## Shared consumers

Monitors, conversations, and editor persona queries remain separate ACP consumers, with their existing model choices, workspaces, permission policies, and lifecycle. They do not acquire the shell's tab session or enter its tool loop. See [[monitoring]], [[conversations]], and [[editor-tab]].
