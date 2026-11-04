# ACP

ACP is a core service for starting and querying Agent Client Protocol connections. Shell tabs use it through their command bar and a settled Markdown reply beneath the typed line. Live activity belongs to the connection tab, not an in-tab response panel. Any tab plugin can request the scoped core API without owning a terminal. Harness tabs have no ACP command or prose route. Monitors, conversations, and editor queries retain their separate sessions over the shared protocol transport.

## Availability and plugin API

A plugin requests `startAcp`, `promptAcp`, and `resetAcp` in its declaration. Each capability is bound to that plugin's own answering tab, or its own invoking tab when there is no answering tab. It cannot start or query a different plugin's tab or a shell tab that invoked its command. An unavailable or disabled owner returns the ordinary request rejection `ACP tab is unavailable.`.

- `startAcp()` begins or reuses the tab's connection and returns `{ model }`, the identity of the session it began or reused, or `{ error }`. Startup is lazy and the handshake may still be pending. It takes an optional request: `startAcp({ withoutTools: true })` records that the tab's session runs without a tool table, so no browser, question, or database command can run on it and no reply line is recognized as one. The request belongs to the tab, so it holds for every prompt on that session and is forgotten only when the tab closes.
- `promptAcp(prompt)` runs the core database/browser/question loop and resolves with the final answer. Connection startup is automatic if needed. Provider and tool wait time belongs to core and is exempt from the plugin handler deadline.
- `promptAcpResult(prompt)` runs the same prompt and resolves with a result rather than a string: the reply and the session that produced it, or the reason there was none. A refusal resolves with a line of prose, so a caller handed one string cannot tell an answer from a refusal without reading its text.
- `resetAcp()` closes the connection and returns whether one existed. It settles in-flight requests and prevents obsolete callbacks from updating a replacement prompt.

A plugin requesting `promptAcp` supports the core `acp` and `acp reset` commands. The shell requests all three operations. A terminal, `spawnTerminal`, and `hostsCommandBar` are not prerequisites for the ACP API. Core owns protocol I/O, session lifecycle, tools, transcript state, and settlement. There is no ACP plugin or client response hook. Plugins retain their scoped transcript-snapshot action and completed background-reply subscription.

## Commands

`acp <prompt>` queries the current supported tab's connection. Bare `acp` prints `Usage: acp <prompt>.`. `acp reset` ends that connection and reports `ACP session reset — next acp prompt will start fresh.`, or `No active ACP session to reset.`.

Reset confirmation is one completed background reply beneath the exact reset line typed, with no immediate duplicate. Interrupting a prompt produces two distinct replies: the original prompt's one `ACP session closed.` reply and the reset invocation's one confirmation. Reset again reports the no-session message once.

A shell's `acp` prompt does not hold its command bar. Other lines keep working while it runs. When it settles, the shell appends exactly one Markdown reply at the current bottom of its output, beneath an echo of the exact `acp <prompt>` line that was typed, so it still reads correctly after other commands ran in between. That happens once for an answer, a refusal with `ACP: a prompt is already running.`, a usage line, an `ACP error: …` line, `ACP session closed.` after reset or close, and `ACP: prompt cancelled.` after cancellation. A second prompt while one is running is refused without disturbing the active prompt, and nothing queues. Callbacks arriving after settlement add no second reply.

The shell's ordinary application-command dispatcher recognizes these commands and marks their replies as core-rendered, so dispatch itself adds no immediate terminal line. Unclaimed shell-bar lines still go to zsh; use an explicit `acp` prefix to query the connection. See [[shell-tab]].


## Provider and model

The provider remains OpenCode, launched with `opencode acp`. It must be installed, authenticated, and on PATH. A bare agent command missing from the server's own PATH is looked up on the PATH the user's interactive shell sets up, so an agent installed through a version manager's rc-file setup starts the same way it does in the user's terminal. The agent then runs with that PATH. Model selection uses the harness catalog's OpenCode list, including project overrides. `google/gemini-3.1-flash-lite` is preferred while listed; otherwise the first available model is used. An empty list refuses the operation with `ACP: no opencode model is available in the harness catalog.`.

The session's configured provider/model appears in its connection row after the handshake. The shared ACP transport still denies native permission requests except where a separate consumer explicitly supplies its own allowlist.

## Connection lifecycle

Every successful core-tab handshake begins a durable project-scoped record, including plugin-owned sessions and the launcher summarizer. The configured model and original owner name are captured then. Local connection startup remains lazy: starting alone need not finish a handshake or create a record. An accepted first prompt is reserved before handshake and recorded before any activity. Each logical prompt has one block across tool turns and cold-start retry; refusals create no block and never settle another request. Native message, thought, tool, plan, and permission activity retains exact whitespace, without duplicating display chunks. Host commands and results are ordered tool entries. See [[acp-records]].

`AcpSessionManager` in `src/acp/session-manager.ts` owns one connection per tab, starts it on demand, reuses it across prompts, and closes it on reset, tab closure, plugin failure, and shutdown. A local subprocess starts in the tab's working directory at connection creation; a workspaced tab passes its workspace and offline confinement to the existing sandbox. A changed directory does not replace an already-open conversation. See [[sandbox]]. Local agent cleanup sends a graceful termination signal to its owned ACP process group and awaits exit before releasing the execution workspace. If the process tree does not exit within one second, cleanup escalates to a forceful signal; if exit still cannot be confirmed within five seconds, cleanup reports a warning and continues releasing resources without replacing the task outcome. A process-group existence probe that fails with a permission error is treated as present, not as confirmed exit, so it follows the same bounded shutdown and warning path.

`AcpManager` in `src/acp/manager.ts` owns prompt orchestration. An overlapping prompt is refused with `ACP: a prompt is already running.`, without cancelling the existing one. A reset or close settles a pending call with `ACP session closed.`. A fatal connection error is shown and the session is forgotten; the next prompt starts fresh. A prompt-level error leaves a viable session intact, including rate limits. Every one of those settles with a result saying which kind of line it is, so a caller that acts on what it is handed can tell a refusal from an answer.

A session carries an identity minted when it is created and forgotten when it is closed, and `startAcp` reports it beside the model. A caller that primed one session — a persona, a trust delimiter — compares it to learn that the session it is now talking to is a different one, because a replacement arrives with nothing the previous one was told.

### Cancellation

Core cancellation returns false when no logical request is active and starts no connection. Otherwise it aborts that request's host loop and active or queued question immediately, preserving unrelated questions. Concurrent calls share one cancellation. Running browser or database work may still complete; its late result cannot dispatch another command or provider turn.

The request stays reserved and `Running` until both the native cancellation notification write and the original provider turn finish. Provider completion does not release the turn while its cancellation notification is still pending, and notification completion alone is not provider drain. Another prompt during that interval receives `ACP: a prompt is already running.`. Final native activity stays in the cancelling block. After both boundaries complete, the request settles once with `ACP: prompt cancelled.`, becomes `Idle`, and a later prompt reuses the same session identity and record UUID. Cancellation before handshake finishes initialization on the viable session but never sends the cancelled prompt or a notification with an undefined session id. Native permission requests after cancellation are denied as cancelled.

Reset or close wins during drain, settles immediately with `ACP session closed.`, closes the record, and releases cancellation callers. Fatal loss also settles and closes once. A cancellation-send rejection, including one after provider completion, closes the failed session with `ACP: cancellation failed: <reason>` and does not settle as a successful cancellation. There is no cancellation timeout or forced process kill for a healthy provider: one that never drains stays reserved until reset, close, or fatal loss. A shell prompt settled this way still produces exactly one background reply. This backend operation adds no command, plugin capability, or button.

Response identity and pending-request metadata are owned by the tab runtime. Core records ACP entries in the tab's existing transcript and tracks their identity without copying the text. Immutable running-entry replacements retain that identity, so settlement never finalizes an unrelated running shell entry. Existing transcript limits and persistence behavior remain in force; no saved configuration, transcript, or profile is migrated or cleaned up.

## Answers, activity, and questions

The shell shows only the settled answer as sanitized GitHub-flavored Markdown in its output. It has no ACP response panel, responding status, or Reset ACP button. Thinking, tool steps, live activity, and prompt history appear in the connection tab. The shell's tab dot still blinks during the operation. See [[connections-tab]].

The connections panel's ACP rows open or focus the corresponding connection tab when they carry a durable record or the tab's own live ACP reference. Rows that offer a transcript snapshot keep that separate button, and clicking it never opens the record tab. See [[connection]].

Reset remains available through `acp reset`, the connection tab's **Close session**, and `connections close acp:<name>`. Transcript snapshot actions and shared tool-step collapse remain available without a response panel. File and web links in Markdown replies retain their existing targets.

Questions use the existing core question panel and answer protocol. A centre tab's question is shown once when that tab is current. Any selected active docked plugin tab shows its pending question, even before any ACP response exists and without a plugin hook, terminal, or command bar. A hidden docked body does not raise one; returning to it restores a still-pending question. The question's tab/id determine where the answer goes. See [[agent-questions]].

Reset or close aborts the current ACP request's question, whether active or queued, and preserves unrelated questions. An aborted loop does not issue another provider prompt after a tool returns. Calls without an abort signal retain the existing question lifecycle.

The connections panel retains the `acp:<provider/model>` row, its close action, and the transcript snapshot button on surfaces that offer one. The snapshot uses the existing tab transcript; monitor and editor transcript scopes retain their own recorded exchanges. See [[connection]].

## Autonomous tool loop

Each user prompt receives the existing database, browser, and question primers plus the Markdown instruction. `runAcpToolLoop` in `src/acp/loop.ts` streams each turn, extracts the last recognized command line, runs it, and feeds the result back until there is a final answer or eight tool steps have run.

The tools are declared once in `src/acp/tool-table.ts`: browser, question, then database. Their order controls command ownership; extraction selects the reply's last recognized tool line. Fences and common prompt prefixes are tolerated. Only the final occurrence of an emitted command is removed from the displayed reply. A cold, empty first reply is retried once in the same transcript entry.

A session a plugin started with `withoutTools` builds no tool table at all. Its primer carries no tool text, no reply line is read as a command, and an emitted command has nothing that runs it — the loop answers with the reply as prose. This policy belongs to the tab and applies to every prompt on it, including a prompt typed with the `acp` command, until the tab closes. A typed `acp` command on an unrestricted tab still runs the full table.

Tool results are recorded as ACP steps and collapse through the existing transcript rendering. The cap reports `(stopped after 8 tool steps)`. Arbitrary shell commands are not ACP tools. Database/browser/question execution remains on the machine running Janissary, even when the provider runs remotely.

## Remote connections

A remote shell or other remote plugin tab uses its existing channel and workspace for the ACP agent. The local side chooses the model and sends the launch request; the remote hosts the ACP client, so prompts and chunks cross SSH instead of JSON-RPC. Tabs sharing one channel still have independent ACP session ids.

Before the channel is attached, the operation refuses with `ACP: the remote session is still connecting.`. Transport loss closes the tracked core ACP connection and its record locally, settling any pending prompt. Other remote processes retain their existing recovery policy. After the channel is ready, another core request creates a new transport identity and record. Late updates from detached or replaced sessions are ignored. The existing remote platform confinement rules remain unchanged. Remote shell tabs offer ACP through their command bar; harness tabs remain terminal surfaces. See [[remote-server]].

Closing a remote ACP session waits for the remote child process to exit before reporting it released. If exit is not observed within five seconds, release is reported as uncertain and an owning agent run records a cleanup warning. Repeated and concurrent closes share one shutdown attempt.

## Errors and notifications

Fatal errors are shown as `ACP: <message>` and forget the connection. Existing bounded stderr details remain available: the last 2000 characters, restricted to the last ten lines. Prompt errors appear as `ACP error: <message>` in the response entry. Existing start, state-change, and rate-limit notification events remain in use.

## Shared consumers

Monitors, conversations, and editor persona queries remain separate ACP consumers, with their existing model choices, workspaces, permission policies, and lifecycle. They do not acquire the shell's tab session or enter its tool loop. See [[monitoring]], [[conversations]], and [[editor-tab]].
