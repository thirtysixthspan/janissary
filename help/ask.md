### ask

Send a prompt to the tab's core ACP session, which runs the models of the `ask` role in order of preference. The shell prints the exact `ask <prompt>` line and returns to the bar immediately, and the settled answer appears once in its output as rendered Markdown under that line. Live activity appears in the session's connection tab, not a response panel.

**Usage**

`ask <prompt>`

`ask reset`

**Use cases**

- Ask the current tab's ACP agent a question while continuing to use the shell.
- Cancel a running prompt from its connection tab without ending the session.
- Reset the session when you want a fresh conversation.

**Examples**

- `ask Explain this failing test` sends a prompt to the ACP agent.
- `ask reset` ends the current session; the next prompt starts a fresh one.

**Notes**

- The models come from the `ask` role in `roles.json` (the project's `.janissary/roles.json`, else `~/.janissary/roles.json`), or the default `ask` role when the file has none. Disabled models are skipped, including an open session's model if it became disabled. If no enabled model remains, the request reports `ACP: the ask role lists no models.` When an enabled model fails before it replies, for example because it can't start, isn't signed in, or is out of credits, the shell shows `ACP: <harness> <model> failed — trying <harness> <model>.` and the prompt runs on the next enabled one. The prompt fails only after every enabled model has failed, with `ACP: every model in the ask role failed.` and one line per model.
- The `ask` role's `commands` list grants native ACP commands. The default ask role can list and query databases, browse to a page and read its content, and ask or approve a question. A missing or empty grant list runs no native tools. Use `roles` to edit the grants; the next prompt reads the updated role.
- A second prompt while one is running is refused with `ACP: a prompt is already running.`. The running prompt is unaffected and nothing is queued.
- The answer arrives once the prompt settles. Other commands can run in the shell in the meantime. If nothing else was printed since your line, the answer appears right beneath it. Otherwise the shell prints your line again at the bottom with the answer under it.
- **Cancel** in the connection tab stops the running prompt but keeps the session, so the next prompt reuses it. The status stays `Running` until the provider drain finishes, then reads `Idle`.
- **Close session** in the connection tab and `connections close acp:ask:<provider/model>` both end the ask session. Reset does too: the next ask prompt starts fresh, and reset reports its own confirmation. A pending prompt reports `ACP session closed.`. The tell session has separate commands and connection identity; see `help tell`.
- `ask reset` reports `ACP session reset — next ask prompt will start fresh.` or `No active ACP session to reset.`. A pending prompt reports `ACP session closed.`.
- Run `connections` to see the session's retained row and open its connection tab. The shell's connections window row opens it too.
- A shell row has no transcript snapshot button. The shell's **Open transcript** button opens the terminal's plain-text transcript file.
