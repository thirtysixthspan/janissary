# ACP agents

<img class="agent-float" src="/agents/ahmed-south-east.png" alt="" />

`acp <prompt>` sends a prompt to an external AI agent and streams its reply into the current tab's transcript. The agent speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP); in this app it is fixed to OpenCode, so there is nothing to configure:

```
acp summarize the open TODO comments in this project
```

The reply arrives as formatted Markdown: headings, lists, tables, and code blocks all render as it streams in.

## Before the first prompt

The `opencode` binary must be installed, authenticated, and on your `PATH`. If you have not signed in yet, run `opencode auth login` in a terminal first. There is no setting to point `acp` at a different agent.

## One conversation per tab

The first `acp` prompt in a tab starts the agent; later prompts in the same tab continue the same conversation, so the agent remembers what came before. Each tab has its own separate session, and the agent runs in the tab's current working directory.

To start over, reset the session:

```
acp reset
```

This ends the conversation and clears the accumulated context. The next `acp` prompt begins fresh, and the app confirms with `ACP session reset — next acp prompt will start fresh.`. When no session is active, `acp reset` replies `No active ACP session to reset.` instead of failing.

An active session also appears as the connection `acp:opencode` in the tab's connections list.

## The agent can look things up itself

<img class="agent-float left" src="/agents/aslan-south-west.png" alt="" />

When answering needs data, the agent can run the app's own `db` and `browser` commands on its own: query a SQLite database, fetch a web page, read its content. Each command it runs, and the result, is fed back to it so it can continue, up to a limit of 8 steps per prompt. If it hits the limit, the transcript shows `(stopped after 8 tool steps)`.

These automatic steps appear collapsed in the transcript as a tool-step entry. Click it, or press `Ctrl+T`, to expand and see exactly what the agent ran. Only `db` and `browser` are available to it; the agent cannot run shell commands or anything else.

## Usage errors

Running `acp` with no prompt prints `Usage: acp <prompt>.`.

## In a workspaced tab

If the tab is a [workspaced agent](/user-documentation/advanced-agents/workspaced-agent), the ACP agent is confined by the same sandbox as the tab's shell. See [Workspacing](/user-documentation/advanced-agents/workspacing) for what the sandbox allows and blocks.
