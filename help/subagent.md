### subagent

Run an AI task in a fresh clone with a named role and hand the distilled result back to whoever launched it. A person uses flags and reads Markdown replies; an `ask` or `tell` agent uses a one-line JSON argument and receives its result as later prompts.

**Usage**

`subagent --role <role> [--task <file.md>] [--context <text>]`

`subagent {"role":"<role>","context":"<text>"}`

`subagent {"role":"<role>","task":"<file.md>","context":"<text>"}`

**Use cases**

- Hand research, review, or implementation to a role whose models suit it, then keep working while it runs.
- Give the subagent an existing AI task file plus optional extra directions, or write the whole assignment in the context and omit the task file.
- Let an ACP agent delegate without blocking its own tool loop.

**Examples**

- `subagent --role research --task research.md --context "Focus on the parser"` starts a background run from a shell.
- `subagent --role research --context "Summarize the parser changes"` starts one with the assignment written inline instead of in a task file.
- `subagent {"role":"research","task":"research.md"}` emits the same run from an `ask` or `tell` session.
- `subagent {"role":"research","context":"Summarize the parser changes"}` emits one with no task file.

**Notes**

- A person writes the flag form; flags may be in any order and a value containing spaces is one quoted argument. An ACP caller writes the JSON form on one line, with `role` and `context`, optionally `task`; embedded newlines are escaped as `\n`. The form is chosen before decoding: an argument whose first non-space character is `{` is read as JSON, and everything else, including an array, a scalar, or quoted JSON, is read as flags. Only `role`, `task`, and `context` are accepted — no per-launch model or effort option. A role is always required, and either a task file or a non-empty context must supply the assignment. When the task file is omitted, the context is the assignment and no task file is looked up; when both are given, the context is appended as extra directions.
- The command token is matched regardless of case, but `subagents` and `subagent-x` are other words, not this command.
- An ACP caller gets empty output immediately; the command does not wait for the run. The `started` and completion messages arrive later as new prompts in the caller's own session. A person gets no immediate result either: the canonical-role Markdown replies `Subagent <role> started.` and `Subagent <role> <status>.` followed by a blank line and the output appear under the original line, with a link to the run's record on completion. The subagent is asked to write its final result between `<final_result>` and `</final_result>` tags; only the contents reach you — the tags and any surrounding reasoning or tool calls are discarded.
- Each message an `ask` or `tell` caller receives is one line of JSON. A `started` message has `status` set to `started` and the fields `role` (the canonical role name), `sessionId`, and `callerId`, in that order; it means the run is going in the background. A completion has `status`, `sessionId`, `callerId`, and `output`, in that order; `status` is `completed`, `partial`, `failed`, or `terminated`, and `sessionId` is null when the run never completed a handshake. A `started` message can be skipped when its completion overtakes it.
- Only Terminate, closing the tab that launched the run, closing that tab's ACP session, or shutting down the app stops a running subagent. Aborting the prompt that launched it does not. When you terminate a subagent, its retained record ends with the answer `Subagent terminated.`
- From a remote tab, a run whose connection was replaced or dropped before startup fails with `Remote connection unavailable.`
- A subagent cannot launch another subagent: its available commands never include `subagent`, whatever its role grants.
- A completion's `status` tells you how the run ended. `completed` means it finished successfully. `partial` means it was stopped at the tool-loop limit set by `maxToolTurns` in your [configuration](/user-documentation/getting-started/configuration); the run keeps its final answer without an added suffix and reads as `Partial` in the [connections list](/user-documentation/command-bar/connections#the-connections-tab). `failed` means the output is the source error. `terminated` means it was stopped.
- A wrong form, an unknown role, a role with no enabled models, and a disabled command each produce one caller-specific refusal and start nothing. A person sees the flag usage, unknown-role, empty-role, or `Command is disabled: subagent.` line as a background reply; an ACP caller sees the JSON usage, unknown-role, empty-role, or disabled line as its tool output. An ACP caller whose own session can't be identified is refused with `Subagent: caller session is not available.` and starts nothing; a person caller needs no such session metadata.
- The command must be granted to the caller's role to run. It is offered where `ask` and `tell` are available.
- A task file is resolved inside a fresh clone of the project, so a file that exists only as an uncommitted local change is not found, and the run never uses your own directory. Your run's record is titled `Subagent: <task filename>` from the task file you selected at launch, or `Subagent: inline` when you wrote the assignment in the context. In the connections list and as its own connection tab's title, the run is named `subagent:<role>` with the canonical role name, such as `subagent:research`.
