## acp

A tab can drive an [Agent Client Protocol](https://agentclientprotocol.com) agent via the `acp <prompt>` command. This is an experimental, read-only MVP.

### Hardcoded agent

The agent command is hardcoded to OpenCode: `opencode acp`. There is no configuration or environment variable — `opencode` must be installed, authenticated (`opencode auth login`), and on `PATH`. OpenCode's model is configured via the `OPENCODE_CONFIG_CONTENT` env var passed to the subprocess (currently `google/gemini-3.1-flash-lite`), and the agent connection is shown as `acp:<agent>` in the tab's status popup.

### Connection lifecycle

Janissary acts as the ACP client: on the first `acp` prompt in a tab it spawns the agent as a subprocess, speaks JSON-RPC over stdio, and reuses the per-tab connection across subsequent prompts. The subprocess inherits the tab's current working directory.

### Reply streaming

The agent reply streams into a running log entry keyed by the prompt text. The text is passed through `formatAgentOutput` (`src/tab.ts`): GitHub-flavored markdown tables (a `|`-delimited header row followed by a `---` separator row) are re-rendered as aligned, box-drawn tables, and the remaining prose — which arrives as one long line with no newlines — is word-wrapped to the transcript's content width (terminal columns minus borders/padding/scrollbar). Rendered table rows are left unwrapped so their columns stay aligned even when wider than the wrap width. While awaiting the agent, the tab's busy indicator flashes. On completion the entry is finalized; empty output renders as `(no output)`.

### Database and browser assistance (autonomous tool loop)

The `db` grammar (`DB_PRIMER` in `src/db.ts`) and the `browser` grammar (`BROWSER_PRIMER` in `src/browser-command.ts`) are both prepended to every user `acp` prompt (but not to the tool-result follow-ups within a loop), so the agent stays aware of the syntax even when a session is reused, and is instructed to end a reply with exactly one command on its own final line when it needs data. `BROWSER_PRIMER` exposes a deliberately simplified surface — `browser goto`, `browser content`, `browser eval` only — and the host handles window/headless/mode management (auto-launching headless and auto-opening a window).

The `acp` handler then drives an autonomous loop (`runAcpToolLoop` in `src/acp-loop.ts`, wired with rendering/execution callbacks in `src/cli.tsx`):

1. The agent's reply streams into a transcript entry (the first turn shows the user's prompt; continuation turns have no prompt line).
2. On completion, the reply is scanned bottom-up (tolerating a code fence or a `$ `/`> ` prefix) for a command: `extractBrowserCommand` first, then `extractDbCommand` (a `browser` command takes precedence when present).
3. If a command is found, it is executed immediately — `runBrowserInTab` for `browser` (async), `runDbInTab`/`runDbCommand` for `db` (sync) — shown in the transcript as its own command entry (input = the command, output = the result), and the output is sent back to the agent as a follow-up prompt asking it to continue or give a final answer. The loop is async-capable: `runCommand` may return a `Promise`, which the loop awaits (a sync command still completes in the same tick).
4. The loop repeats until the agent replies with no command, or a cap of 8 tool steps is reached (a `(stopped after 8 tool steps)` notice is logged in that case).

A freshly connected agent (e.g. OpenCode loading its model on the first prompt) sometimes returns an empty first reply; the loop retries the first turn once — reusing the same transcript entry — before treating an empty reply as a final answer, so the first `acp` request no longer comes back empty.

Only `db` and `browser` commands are auto-run — the agent cannot execute arbitrary shell. `db` is also dispatchable through `runCaptureInTab` (the shared command-capture path used by `msg …request`), which executes a resolved `db` command via `runDbCommand` rather than refusing it as an app command, so a `db` command also works as an inter-agent `request`. (`browser` is not yet offered through that inter-agent path.)

### `acp` command

`acp <prompt>` drives an external [Agent Client Protocol](https://agentclientprotocol.com) agent from the current tab. The agent is hardcoded to OpenCode (`opencode acp`) — no configuration or environment variable is required. With no prompt, `acp` prints `Usage: acp <prompt>.`. See the External ACP Agents section for details.
