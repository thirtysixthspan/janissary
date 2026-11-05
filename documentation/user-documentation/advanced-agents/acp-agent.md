# Query ACP from a shell

Use `acp <prompt>` in a shell tab's command bar to query OpenCode:

```
acp summarize the open TODO comments in this project
```

The command returns to the bar immediately. The shell stays usable while the prompt runs, so ordinary non-ACP commands keep working; a second `acp` prompt is refused with exactly `ACP: a prompt is already running.`, and nothing is queued. The shell prints the exact line you typed as soon as you send it. When the answer is ready, it appears once as rendered Markdown, right beneath that line if nothing else was printed in the meantime. If other output arrived first, the shell prints your line again at the current bottom with the answer under it, and the intervening output stays above. There is no ACP response panel, no responding status, and no Reset ACP button. The agent uses the Agent Client Protocol (ACP), and the app manages its connection for you.

For an autonomous task that runs until completion and may use skill-granted Janissary commands, see [Run an autonomous task](/user-documentation/advanced-agents/agent-command). It uses a separate local session and its own retained record.

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

## Before the first prompt

OpenCode must be installed, authenticated, and on your `PATH`. The `PATH` your shell's rc file sets up counts too, so an `opencode` installed through a version manager such as nvm is found even when the app was started without that setup. Run `opencode auth login` in a terminal if you have not signed in. There is no setting to choose a different provider for this connection.

Use the explicit `acp` prefix for a model reply; unclaimed text in a shell bar goes to zsh.

## Which model it runs

The model comes from the OpenCode list in the harness catalog, including a project's `.janissary/harness-models.json` override. The app prefers `google/gemini-3.1-flash-lite` while that model is listed; otherwise it uses the first listed model. An empty list produces `ACP: no opencode model is available in the harness catalog.`.

The connections window shows the model the session started with. That choice is separate from the models used by monitors, conversations, and editor queries.

## One conversation per tab

The first prompt starts a connection in the shell's working directory. Later prompts in the same tab reuse it and remember the earlier conversation. Each tab has its own session. Reset it after changing directories if you want a fresh connection in the new location.

A second prompt submitted while one is still running in the same shell is refused with exactly `ACP: a prompt is already running.`. The first prompt keeps running, and nothing is queued behind it. A command that isn't an ACP prompt still runs normally in the meantime.

## Cancel, close, and reset

There are three ways to stop work, and they differ:

- **Cancel** a running prompt from its connection tab. The prompt settles as cancelled, the shell receives one `ACP: prompt cancelled.` reply, and the session stays open for the next prompt. The status remains `Running` while the provider finishes its native cancellation and drain, then reads `Idle`. The session and its record keep the same identity.
- **Close session** in the connection tab, or `connections close acp:<name>`, ends the session. A pending prompt reports `ACP session closed.`. The retained record becomes `Closed` and its tab is read-only.
- `acp reset` also ends the session. A pending prompt reports `ACP session closed.`. It reports its own single confirmation, `ACP session reset — next acp prompt will start fresh.`, or `No active ACP session to reset.` when there is nothing to reset. The next prompt starts a fresh session and record.

Closing the shell also closes its ACP connection. Reset cancels a question from that ACP request, including one waiting behind another question. Questions from unrelated requests stay pending.

## Let the agent look things up

<img class="agent-float left" src="/agents/ekrem-south.png" alt="" />

The agent can run the app's database, browser, and question tools while answering: query a database, fetch a page, read its content, or ask you for an answer. The result goes back to the agent so it can continue, up to eight tool steps per prompt. If a prompt reaches that cap, the settled shell reply and the record's final answer in the connection tab end with a `(stopped after 8 tool steps)` paragraph, so you can tell the answer was cut short and retry a narrower request.

Tool steps and the agent's thinking appear in the connection tab, not in the shell output. Thought entries start collapsed there and tool entries start expanded. Click an entry's label to open or close it. A tool step whose text is JSON reads as indented JSON. Only these three tools are available in this loop; it cannot run arbitrary shell commands.

Questions identify the tab asking them. Answer or cancel in the question surface owned by that tab. A selected docked shell can show its question too. A hidden docked shell does not raise a question panel, and a centre question renders once.

## Follow the work in Connections

Every ACP session started from a shell has a retained connection record. The shell's row in the connections window, and its row in the connections tab, opens the session's connection tab. The record survives the shell closing and an application restart, and a closed record opens read-only. A clean close saves completed history; a crash can lose activity from the prompt that was running, because streaming activity is not written continuously. Records closed more than 30 days before startup are removed then, not on a rolling timer.

The connection tab is the full live view: metadata, prompt blocks, activity, and the final answer. It is not a plain-text snapshot. A shell row has no snapshot button; the separate **Open transcript** button in the shell metadata row opens the terminal's own transcript file. Only an editor tab's connections panel draws the monitor and persona snapshot buttons; shell and harness windows do not.

A run started from this tab with `agent in a tab` also appears in the window as an `Agent: <task filename>` row while it runs. That row opens the run's connection tab and disappears when the run ends. See [Connections](/user-documentation/command-bar/connections) for the list, lookup, close, delete, and retention rules.

## Use a docked shell

An ACP answer belongs to its shell even when another tab is current. The answer is appended to that shell's output whether the shell is in the centre or docked. A selected docked shell can show its pending question; a hidden one does not take focus with a question panel.

A link in a shell answer acts for the shell that owns the answer, not for the tab you are looking at. Clicking a web address runs `open <address>` and clicking a `path:line` reference runs `edit <path:line>`, both as if you had typed them in that shell. See [Markdown rendering](/user-documentation/advanced-agents/markdown-rendering) for which links are clickable.

## In a workspace or on another host

<img class="agent-float" src="/agents/hamza-south-east.png" alt="" />

A sandboxed shell's ACP process uses the same workspace confinement and offline setting. A remote shell starts its ACP process on that host in the remote workspace. Model selection still comes from your local catalog.

The database, browser, and question tools continue to act on the machine running Janissary. A remote ACP query therefore uses your local database and browser for those tools.

Before SSH has finished connecting, a prompt reports `ACP: the remote session is still connecting.`. Finish connecting and retry. See [Shell tabs](/user-documentation/command-bar/shell) for local and remote launches.

## Errors and recovery

Bare `acp` prints `Usage: acp <prompt>.`. Two kinds of failure look alike but behave differently.

A connection failure starts with `ACP:`, for example `ACP: ACP agent exited.` or `ACP: failed to start ACP agent: <reason>`. The connection is forgotten, so the next prompt starts a new one. When the agent printed anything to its error output, the message ends with that text, limited to its last ten lines and 2000 characters.

A prompt failure, such as a rate limit, starts with `ACP error:` and appears in the reply. The connection stays, and so does the conversation, so you can send the prompt again.

The connection is listed as `acp:<provider/model>`. Use its close control, its connection tab's **Close session**, or `connections close` to end it. A closed session stays listed as a read-only record until you delete it after confirmation or it expires.
