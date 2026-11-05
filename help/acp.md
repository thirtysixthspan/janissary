### acp

Send a prompt to the core OpenCode ACP session. The shell prints the exact `acp <prompt>` line and returns to the bar immediately, and the settled answer appears once in its output as rendered Markdown under that line. Live activity appears in the session's connection tab, not a response panel.

**Usage**

`acp <prompt>`

`acp reset`

**Use cases**

- Ask the current tab's ACP agent a question while continuing to use the shell.
- Cancel a running prompt from its connection tab without ending the session.
- Reset the session when you want a fresh conversation.

**Examples**

- `acp Explain this failing test` sends a prompt to the ACP agent.
- `acp reset` ends the current session; the next prompt starts a fresh one.

**Notes**

- A second prompt while one is running is refused with `ACP: a prompt is already running.`. The running prompt is unaffected and nothing is queued.
- The answer arrives once the prompt settles. Other commands can run in the shell in the meantime. If nothing else was printed since your line, the answer appears right beneath it. Otherwise the shell prints your line again at the bottom with the answer under it.
- **Cancel** in the connection tab stops the running prompt but keeps the session, so the next prompt reuses it. The status stays `Running` until the provider drain finishes, then reads `Idle`.
- **Close session** in the connection tab and `connections close acp:<name>` both end the session. Reset does too: the next prompt starts fresh, and reset reports its own confirmation. A pending prompt reports `ACP session closed.`.
- `acp reset` reports `ACP session reset — next acp prompt will start fresh.` or `No active ACP session to reset.`. A pending prompt reports `ACP session closed.`.
- Run `connections` to see the session's retained row and open its connection tab. The shell's connections window row opens it too.
- A shell row has no transcript snapshot button. The shell's **Open transcript** button opens the terminal's plain-text transcript file.
