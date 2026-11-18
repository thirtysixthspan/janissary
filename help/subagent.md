### subagent

Run an AI task in a fresh clone with a named role and hand the distilled result back to whoever launched it. A person uses flags and reads Markdown replies; an `ask` or `tell` agent uses a one-line JSON argument and receives its result as later prompts.

**Usage**

`subagent --role <role> --task <file.md> [--context <text>]`

`subagent {"role":"<role>","task":"<file.md>","context":"<text>"}`

**Use cases**

- Hand research, review, or implementation to a role whose models suit it, then keep working while it runs.
- Give the subagent an existing AI task file plus optional extra directions.
- Let an ACP agent delegate without blocking its own tool loop.

**Examples**

- `subagent --role research --task research.md --context "Focus on the parser"` starts a background run from a shell.
- `subagent {"role":"research","task":"research.md"}` emits the same run from an `ask` or `tell` session.

**Notes**

- A person writes the flag form; flags may be in any order and a value containing spaces is one quoted argument. An ACP caller writes the JSON form on one line, with `role`, `task`, and optional `context`; embedded newlines are escaped as `\n`. Only `role`, `task`, and `context` are accepted — no per-launch model or effort option.
- The command token is matched regardless of case, but `subagents` and `subagent-x` are other words, not this command.
- An ACP caller gets empty output immediately; the command does not wait for the run. The `started` and completion messages arrive later as new prompts in the caller's own session. A person gets no immediate result either: the canonical-role Markdown replies `Subagent <role> started.` and `Subagent <role> <status>.` followed by a blank line and the output appear under the original line, with a link to the run's record on completion.
- A wrong form, an unknown role, a role with no enabled models, and a disabled command each produce one caller-specific refusal and start nothing. A person sees the flag usage, unknown-role, empty-role, or `Command is disabled: subagent.` line as a background reply; an ACP caller sees the JSON usage, unknown-role, empty-role, or disabled line as its tool output.
- The command must be granted to the caller's role to run. It is offered where `ask` and `tell` are available.
- The task file is resolved inside a fresh clone of the project, so a file that exists only as an uncommitted local change is not found. The run never uses the caller's own directory.
