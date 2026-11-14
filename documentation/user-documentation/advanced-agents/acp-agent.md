# Query ACP from a shell

Use `ask <prompt>` in a shell tab's command bar to query the models in your `ask` role:

```
ask summarize the open TODO comments in this project
```

The command returns to the bar immediately. The shell stays usable while the prompt runs, so ordinary non-ACP commands keep working; a second `ask` prompt is refused with exactly `ACP: a prompt is already running.`, and nothing is queued. The shell prints the exact line you typed as soon as you send it. When the answer is ready, it appears once as rendered Markdown, right beneath that line if nothing else was printed in the meantime. If other output arrived first, the shell prints your line again at the current bottom with the answer under it, and the intervening output stays above. There is no ACP response panel, no responding status, and no Reset ACP button. The agent uses the Agent Client Protocol (ACP), and the app manages its connection for you. While an accepted `ask` or `tell` prompt runs, its echoed line ends with `Thinking` and a spinner; click either to open its connection tab, where you can follow the agent's thoughts and tool steps. When the prompt settles with a conversation record, `see thought process` opens that same conversation, even after a reset, model switch, or session close; both echoed lines carry the link if the answer is printed again at the bottom. If the final model attempt fails before creating a record, the marker disappears without a link. A refusal or reset also removes the marker, while a deleted or expired conversation leaves a link that does nothing. The marker is not terminal text, so search and copy omit it, and it disappears after reload, docking, or undocking; use `connections` or the shell's connections window to reach a conversation by keyboard.

For an autonomous task that runs until completion and may use skill-granted Janissary commands, see [Run an autonomous task](/user-documentation/advanced-agents/agent-command). It uses a separate session and its own retained record.

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

## Before the first prompt

Each harness your `ask` role lists must be signed in, and an `opencode` entry also needs `opencode` installed and on your `PATH`. With the default role that's `opencode`, then `claude`, then `codex`. The `claude` and `codex` ACP adapters ship with Janissary, so those entries need only the harness's own sign-in. The `PATH` your shell's rc file sets up counts too, so an `opencode` installed through a version manager such as nvm is found even when the app was started without that setup. Run `opencode auth login` in a terminal if you have not signed in. You don't need all three. A model that can't run is skipped.

Use the explicit `ask` prefix for a model reply; unclaimed text in a shell bar goes to zsh.

Use `tell <prompt>` when you want a model to carry out a task with the commands granted to the
`tell` role. The [roles tab](/user-documentation/tab-types/roles) lets you choose separate models and
command grants for `ask` and `tell`.

## Which model it runs

The models come from the `ask` role in your roles file, in the order the role lists them. That's your project's `.janissary/roles.json` when it has one, otherwise `~/.janissary/roles.json`. Edit the role in the [roles tab](/user-documentation/tab-types/roles) to change which models answer and in what order. If the file has no `ask` role, or the role lists no models, the app uses the default one: `opencode-go/deepseek-v4.1-flash` on `opencode` at `medium`, then `claude-haiku-4-5` on `claude` at `high`, then `gpt-6-luna` on `codex` at `high`. Asking never creates a roles file.

The first prompt tries the first model. If that model fails before it replies, say it isn't signed in or it's out of credits, the shell shows its error and then a line like `ACP: opencode opencode-go/deepseek-v4.1-flash failed — trying claude claude-haiku-4-5.`, and the same prompt runs on the next model. Your prompt fails only when every model has failed. Then the reply reads `ACP: every model in the ask role failed.` with one line per model and its error. An entry naming a harness with no ACP adapter fails straight away with `ACP error: no ACP adapter for harness "<name>".`.

Once a model has replied, the session sticks with it. Later prompts in the tab go to that model first and fall back the same way if it fails before replying. Falling back always starts a fresh conversation on the next model. An error that arrives after the model has replied is reported as usual and isn't retried elsewhere, so a tool the agent already ran never runs twice.

The connections window shows the model the session started with. That choice is separate from the models used by monitors, conversations, and editor queries.

The `tell` command uses the matching `tell` role. With the built-in roles, ask can read a file from
the workspace, list and query databases, browse to a page and read its content, and ask or approve a
question. Tell starts with those same commands plus database create/delete, browser eval, and writing and editing workspace files. If you
add or remove a grant, the next prompt reads the updated role. A missing ask or tell role uses its
built-in model and command defaults; an existing role with no grants has no native tools.

The agent has no built-in tools of its own, such as a shell, file editing, or web search, so it can
only run the native commands its role grants.

## Separate ask and tell conversations

The first prompt for each role starts its own connection in the shell's working directory. Later
prompts for that role reuse its conversation. A tab can keep one ask session and one tell session, so
one prompt of each role can run at the same time. The two sessions keep their own histories and
models, while sharing the shell transcript. Reset a role after changing directories if you want its
next prompt to start fresh in the new location.

A second prompt for the same role while one is still running is refused with exactly `ACP: a prompt is
already running.`. The first prompt keeps running, and nothing is queued behind it. The other role and
ordinary shell commands still run while it is active.

## Cancel, close, and reset

You can cancel a prompt, close a session, or reset either role:

- **Cancel** a running prompt from its connection tab. The prompt settles as cancelled, the shell receives one `ACP: prompt cancelled.` reply, and the session stays open for the next prompt. The status remains `Running` while the provider finishes its native cancellation and drain, then reads `Idle`. The session and its record keep the same identity.
- **Close session** in the connection tab, or `connections close acp:<role>:<provider/model>`, ends that role's session. A pending prompt reports `ACP session closed.`. The retained record becomes `Closed` and its tab is read-only. A legacy `connections close acp:<model>` target still selects ask.
- `ask reset` also ends the session. A pending prompt reports `ACP session closed.`. It reports its own single confirmation, `ACP session reset — next ask prompt will start fresh.`, or `No active ACP session to reset.` when there is nothing to reset. The next prompt starts a fresh session and record.
- `tell reset` closes only tell and reports `ACP tell session reset — next tell prompt will start fresh.`, or `No active ACP tell session to reset.`. The ask session remains open.

Closing the shell also closes its ask and tell sessions. Reset cancels a question from that role's ACP request, including one waiting behind another question. Questions from unrelated requests stay pending.

## Let the agent look things up

<img class="agent-float left" src="/agents/ekrem-south.png" alt="" />

The agent can use the file, database, browser, and question tools granted to its role. By default, ask
can read a file from the workspace, list and query databases, open a page, read its content, and ask or
approve a question. Tell has those commands plus database create/delete, browser eval, and writing and editing workspace files. If the model
tries a known command its role doesn't allow, it receives `Command not allowed for role "<role>": <subcommand>.` and can choose another action. The result of each allowed tool step goes back to the model,
up to eight tool steps per prompt. If a prompt reaches that cap, the settled shell reply and the record's final answer in
the connection tab end with a `(stopped after 8 tool steps)` paragraph, so you can tell the answer was
cut short and retry a narrower request.

Tool steps and the agent's thinking appear in the connection tab, not in the shell output. Thought entries start collapsed there and tool entries start expanded. Click an entry's label to open or close it. A tool step whose text is JSON reads as indented JSON. Only these four tools are available in this loop; it cannot run arbitrary shell commands.

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

Every ACP process requests confinement to its workspace, or to its working directory for an ordinary shell or monitor. Confinement requires macOS with workspace isolation enabled and retains the usual harness runtime exceptions. A shell's offline setting also applies to ACP. A remote
shell starts its ACP process on that host in the remote workspace. Model selection and command grants
still come from your local `ask` or `tell` role.

`file read` reads the workspace on the host running the agent, so on a remote tab it reads the remote
clone. A granted `file glob` searches that same workspace. Granted `file write` and `file edit` run there too, so on a remote tab they change only the remote
clone, never your local copy. The database, browser, and question tools continue to act on the machine running Janissary; a
remote ACP query uses your local database and browser for those tools. A remote workspace step shows
`[<host>] ` at the start of its transcript line and of both activity lines in the connection record. A
typed `file read`, `file glob`, `file write`, or `file edit` and a caller-side step carry no tag.

Before SSH has finished connecting, a prompt reports `ACP: the remote session is still connecting.`. Finish connecting and retry. See [Shell tabs](/user-documentation/command-bar/shell) for local and remote launches.

## Errors and recovery

Bare `ask` prints `Usage: ask <prompt>.`. Two kinds of failure look alike but behave differently.

Bare `tell` prints `Usage: tell <prompt>.`. If no enabled tell model is available, the reply is
`ACP: the tell role lists no models.`. When more than one model is tried and all fail, the reply is
`ACP: every model in the tell role failed.` followed by one line per attempt.

A connection failure starts with `ACP:`, for example `ACP: ACP agent exited.` or `ACP: failed to start ACP agent: <reason>`. The connection is forgotten, so the next prompt starts a new one. When the agent printed anything to its error output, the message ends with that text, limited to its last ten lines and 2000 characters.

A prompt failure, such as a rate limit, starts with `ACP error:`. The connection stays, and so does the conversation, so you can send the prompt again.

Either kind of failure that happens before the model has replied moves the prompt on to the next model in its matching role, as [Which model it runs](#which-model-it-runs) describes. You only see the failure as your reply once every model has failed, or when it arrives after the model already replied.

The live connections are listed separately as `acp:ask:<provider/model>` and
`acp:tell:<provider/model>`. Use the matching row's close control, its connection tab's **Close
session**, or `connections close acp:<role>:<provider/model>` to end one. A closed session stays
listed as a read-only record until you delete it after confirmation or it expires.
