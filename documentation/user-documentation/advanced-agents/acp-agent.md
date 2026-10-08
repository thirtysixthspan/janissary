# Query ACP from a shell

Use `acp <prompt>` in a shell tab's command bar to query OpenCode:

```
acp summarize the open TODO comments in this project
```

The reply streams as formatted Markdown in the **ACP** panel above the command bar. Headings, lists, tables, and code blocks render while the answer arrives. The agent uses the Agent Client Protocol (ACP), and the app manages its connection for you.

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

## Before the first prompt

OpenCode must be installed, authenticated, and on your `PATH`. Run `opencode auth login` in a terminal if you have not signed in. There is no setting to choose a different provider for this connection.

Agent tabs do not query ACP. Their command requests still execute shell, database, browser, and other supported commands, but unrecognized prose gets an unknown-command response. In a shell bar, unclaimed text goes to zsh, so use the explicit `acp` prefix when you want a model reply.

## Which model it runs

The model comes from the OpenCode list in the harness catalog, including a project's `.janissary/harness-models.json` override. The app prefers its default while that model is listed; otherwise it uses the first listed model. An empty list produces `ACP: no opencode model is available in the harness catalog.`.

The connections popup shows the model the session started with. That choice is separate from the models used by monitors, conversations, and editor queries.

## One conversation per tab

The first prompt starts a connection in the shell's working directory. Later prompts in the same tab reuse it and remember the earlier conversation. Each tab has its own session. Reset it after changing directories if you want a fresh connection in the new location.

To start over, enter:

```
acp reset
```

You can also click **Reset ACP** in the panel while a reply is still arriving. This stops the connection immediately. The next prompt begins a fresh conversation; previous replies remain visible.

Reset cancels a question from that ACP request, including one waiting behind another question. Questions from unrelated requests stay pending.

The command confirms `ACP session reset — next acp prompt will start fresh.`, or `No active ACP session to reset.`. Closing the shell closes its ACP connection too. A second prompt submitted directly to an already-running connection reports `ACP: a prompt is already running.`; the shell bar keeps its ordinary command ordering.

## Let the agent look things up

<img class="agent-float left" src="/agents/ekrem-south.png" alt="" />

The agent can run the app's database, browser, and question tools while answering: query a database, fetch a page, read its content, or ask you for an answer. The result goes back to the agent so it can continue, up to eight tool steps per prompt. The panel reports `(stopped after 8 tool steps)` when it reaches that limit.

Tool steps appear collapsed. Click a summary to expand it and see the command and result. Only these three tools are available in this loop; it cannot run arbitrary shell commands.

Questions identify the tab asking them. Answer or cancel in the question panel. A selected docked shell can show its question too; hidden shells do not take focus with a question panel.

## Use a docked shell

The ACP panel, reset button, and tool-step controls belong to their shell even when another tab is current. Resetting or expanding steps in a docked shell does not change another tab's connection or transcript. Replies do not duplicate themselves in zsh's terminal.

## In a workspace or on another host

<img class="agent-float" src="/agents/hamza-south-east.png" alt="" />

A sandboxed shell's ACP process uses the same workspace confinement and offline setting. A remote shell starts its ACP process on that host in the remote workspace. Model selection still comes from your local catalog.

The database, browser, and question tools continue to act on the machine running Janissary. A remote ACP query therefore uses your local database and browser for those tools.

Before SSH has finished connecting, a prompt reports `ACP: the remote session is still connecting.`. Finish connecting and retry. See [Shell tabs](/user-documentation/command-bar/shell) for local and remote launches.

## Errors and connection controls

Bare `acp` prints `Usage: acp <prompt>.`. A process that dies is reported and forgotten, so the next prompt starts a new connection. A prompt-level failure, such as a rate limit, keeps a working conversation.

The connection is listed as `acp:<provider/model>`. Use its close control or `connection close` to end it. Its transcript button opens a snapshot in an editor tab. See [Connections](/user-documentation/command-bar/connections).
