## acp

A tab can drive an [Agent Client Protocol](https://agentclientprotocol.com) agent via the `acp <prompt>` command. This is an experimental, read-only MVP.

### Hardcoded agent

The agent command is hardcoded to OpenCode: `opencode acp`. There is no configuration or environment variable — `opencode` must be installed, authenticated (`opencode auth login`), and on `PATH`. OpenCode's model is configured via the `OPENCODE_CONFIG_CONTENT` env var passed to the subprocess (currently `google/gemini-3.1-flash-lite`), and the agent connection is shown as `acp:<agent>` in the tab's status popup.

### Connection lifecycle

Janissary acts as the ACP client: on the first `acp` prompt in a tab it spawns the agent as a subprocess, speaks JSON-RPC over stdio, and reuses the per-tab connection across subsequent prompts. The subprocess inherits the tab's current working directory, and in a workspaced tab it is additionally confined by the same Seatbelt sandbox as the tab's shell/harness PTY — see [[sandbox]]. Both hold for a **local** tab. A remote agent tab's agent runs on the other host instead, in the workspace clone that host provisioned, and its confinement is whatever that machine provides — which on a non-macOS remote is none. See Remote agent tabs below.

If the agent process dies — a failed spawn, a missing binary, or a crash mid-session — the session no longer exists, so it is reported as an `ACP: <message>` line in the tab and forgotten. The tab stays open and the next `acp <prompt>` starts a fresh session rather than writing into a dead one. A prompt that merely *fails* is different: a rate-limited reply reports itself and leaves the session alone, so the accumulated conversation is not thrown away for a condition that clears on its own.

### Reply streaming

The agent is instructed (via the prompt primer) to write its replies in **GitHub-flavored Markdown**, and the tab renders them as formatted Markdown. The reply streams into a running log entry keyed by the prompt text; that entry is flagged `markdown` so the raw Markdown is kept verbatim (not split into plain-text lines) and `flattenBuffer` (`src/tab.ts`) emits it as a single `markdown` buffer line. The web client renders that line by converting the Markdown to HTML (`marked`, GFM enabled) and sanitizing it (`DOMPurify`) before insertion — so headings, lists, tables, fenced code blocks, blockquotes, and links all render, with partial Markdown rendering progressively as it streams. While awaiting the agent, the tab's busy indicator flashes (the dot blinks). On completion the entry is finalized.

The reply text is shown as the model's own words alone, with no surrounding banner or delimiter lines — the streamed and finished reply carries exactly what the model wrote, keeping it visually distinct from tool-call output only by its markdown formatting and position in the transcript.

### Database and browser assistance (autonomous tool loop)

The `db` grammar (`DB_PRIMER` in `src/db.ts`) and the `browser` grammar (`BROWSER_PRIMER` in `src/browser-command.ts`) are both prepended to every user `acp` prompt (but not to the tool-result follow-ups within a loop), so the agent stays aware of the syntax even when a session is reused, and is instructed to end a reply with exactly one command on its own final line when it needs data. `BROWSER_PRIMER` exposes a deliberately simplified surface — `browser goto`, `browser content`, `browser eval` only — and the host handles window/headless/mode management (auto-launching headless and auto-opening a window).

The `acp` handler then drives an autonomous loop (`runAcpToolLoop` in `src/acp-loop.ts`, wired with rendering/execution callbacks in `src/cli.tsx`):

1. The agent's reply streams into a transcript entry (the first turn shows the user's prompt; continuation turns have no prompt line).
2. On completion, the reply is scanned bottom-up (tolerating a code fence or a `$ `/`> ` prefix) for a command: `extractBrowserCommand` first, then `extractDbCommand` (a `browser` command takes precedence when present).
3. If a command is found, it is executed immediately — `runBrowserInTab` for `browser` (async), `runDbInTab`/`runDbCommand` for `db` (sync) — shown in the transcript as its own command entry (input = the command, output = the result), and the output is sent back to the agent as a follow-up prompt asking it to continue or give a final answer. The loop is async-capable: `runCommand` may return a `Promise`, which the loop awaits (a sync command still completes in the same tick).
4. The loop repeats until the agent replies with no command, or a cap of 8 tool steps is reached (a `(stopped after 8 tool steps)` notice is logged in that case).

A freshly connected agent (e.g. OpenCode loading its model on the first prompt) sometimes returns an empty first reply; the loop retries the first turn once — reusing the same transcript entry — before treating an empty reply as a final answer, so the first `acp` request no longer comes back empty.

Only `db` and `browser` commands are auto-run — the agent cannot execute arbitrary shell. `db` is also dispatchable through `runCaptureInTab` (the shared command-capture path used by `msg …request`), which executes a resolved `db` command via `runDbCommand` rather than refusing it as an app command, so a `db` command also works as an inter-agent `request`. (`browser` is not yet offered through that inter-agent path.)

The tool loop always runs on the machine janissary itself is running on, regardless of where the agent does. A remote agent asked to inspect a database is therefore inspecting *this* machine's database files, and a `browser` command drives *this* machine's browser — not the remote workspace's.

### `acp` command

`acp <prompt>` drives an external [Agent Client Protocol](https://agentclientprotocol.com) agent from the current tab. The agent is hardcoded to OpenCode (`opencode acp`) — no configuration or environment variable is required. With no prompt, `acp` prints `Usage: acp <prompt>.`. See the External ACP Agents section for details.

### `acp reset` command

`acp reset` kills the current tab's ACP subprocess and forgets the session. The next `acp <prompt>` will spawn a fresh subprocess and start a new conversation, clearing the accumulated context window. When no ACP session is active, `acp reset` reports that there is nothing to reset rather than failing. In a remote agent tab it disposes the session on the remote host, with the same wording and the same effect.

### Remote agent tabs

`acp <prompt>` works in a tab launched with `agent <name> on <address>` (see [[remote-server]]), and the agent runs **on that host**, inside the workspace clone the host provisioned — so it sees the files the tab is actually working on rather than anything on the local machine. Nothing about the tab reads differently: replies stream in as formatted Markdown, the busy dot blinks while awaiting the agent, and the connections panel and status popup show the same `acp:opencode` row and the same `provider/model` label a local session shows, with no host marker anywhere.

The ACP client itself is hosted by the remote, so what crosses the ssh channel is prompt text and reply chunks rather than JSON-RPC. Which agent and which model run are still decided locally and sent across, so a remote session cannot silently disagree with a local one about the model. The autonomous tool loop and its `db`, `browser`, and `question` commands stay on the local machine — see Database and browser assistance above.

A prompt issued before the remote session is established — while ssh is still authenticating, for instance — is refused rather than queued, with the single line `ACP: the remote session is still connecting.` and no busy state. Retyping it once the tab has finished connecting works. The same refusal is what an inter-agent `msg <tab> request …` addressed to a still-connecting remote tab receives as its answer.

Each tab gets its own agent, including tabs that share one ssh channel and one workspace clone — the launching tab and every agent joined from it through ➕. Their sessions are told apart by an id the local side mints per tab, so a reply always reaches the tab that asked for it, and closing one tab's session leaves the others running.

A dead remote session is reported and forgotten exactly as a local one is, so the next prompt reconnects. A dropped ssh channel closes the whole tab (see [[remote-server]] § Lifecycle and cleanup), taking the session with it; a prompt in flight when that happens surfaces the ordinary `ACP:` error first, and nothing separate is reported for the session itself.

`acp` in a **remote harness** tab is not supported — a harness tab is already driving its own agent binary in a terminal. That is a documented follow-up, not an oversight.
