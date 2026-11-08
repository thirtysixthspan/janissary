### tell

Send a task to the tab's core ACP session, which runs the models and native command grants in the `tell` role. The shell prints the exact `tell <prompt>` line and returns to the bar immediately. If nothing else was printed, the settled answer appears as rendered Markdown beneath that line. Otherwise, the shell prints your line again at the current bottom with the answer under it. Live activity appears in the session's connection tab.

**Usage**

`tell <prompt>`

`tell reset`

**Use cases**

- Ask the current tab's ACP agent to carry out a task while keeping the shell available.
- Use database create/delete or browser eval when those commands are granted to the tell role.
- Reset tell's conversation without ending the ask session.
- Cancel a running prompt from its connection tab without closing the session.

**Examples**

- `tell create a database called demo` asks the agent to create the database using its granted tools.
- `tell reset` closes only the tell session; its next prompt starts a fresh conversation.
- `connections close acp:tell:claude-haiku-4-5` closes the tell session using that live name.

**Notes**

- The models and commands come from the `tell` role in the project's `.janissary/roles.json`, else `~/.janissary/roles.json`. If the file has no tell role, the built-in tell defaults apply. A missing or empty `commands` list grants no tools; editing the role applies to its next prompt. The default tell role has all nine native commands: database create, delete, query, and list; browser goto, content, and eval; and question ask and approve.
- The tell primer asks the model to carry out the task with its available commands and briefly report what it did. An ungranted command from an available tool owner returns `Command not allowed for role "tell": <subcommand>.` to the model as a tool result. For example, this is the expected result for `db sqlite create` when that command is removed from tell.
- The tell session is separate from ask. One ask and one tell prompt can run at once in the same tab. A second prompt for tell while its prompt is active is refused with `ACP: a prompt is already running.`; it is not queued. Ask can still run while tell is active.
- An accepted tell line ends with `Thinking` and a spinner; click either to open its connection tab, then click `see thought process` after the answer settles to reopen the answering conversation. The link still works after a reset, model switch, or session close, but does nothing if you delete the conversation or it expires; a refused prompt or `tell reset` has no marker.
- If tell has no enabled model, the request reports `ACP: the tell role lists no models.`. If more than one model is tried and all fail, it reports `ACP: every model in the tell role failed.` with one line per attempt. Before fallback, the shell shows `ACP: <harness> <model> failed — trying <harness> <model>.`.
- `tell reset` reports `ACP tell session reset — next tell prompt will start fresh.` or `No active ACP tell session to reset.`. A prompt interrupted by reset or close reports `ACP session closed.`. Cancelling a prompt reports `ACP: prompt cancelled.` and leaves the session open.
- The connection tab's **Close session** action closes the tell record's own role. `connections close acp:tell:<provider/model>` closes that live tell session; its notification says `Closed connection acp:tell:<provider/model>.`. Closing the shell also closes both sessions.
- `tell` is available on supported local and remote shell tabs. Harness tabs do not offer tell commands.
