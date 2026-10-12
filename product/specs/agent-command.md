# Agent command

### Launch grammar

The command accepts launch clauses in any order, followed by `execute <ai task> <parameters...>`. Usage is `Usage: agent [launch options] execute <ai task> [parameters...].` Supported clauses are `on <host>`, `in a tab`, `in group <name|id>`, `in workspace <label>`, repeated `with skill <name>`, `using model <model id>`, and `with effort <level>`. Quoted values may contain spaces. Singleton clauses cannot repeat; skill clauses may repeat and resolve once. Group-only selection is valid for a headless launch.

The task path ends the launch header. Every character after the task-path token, including whitespace immediately after it, is returned unchanged as the task parameter tail. The tail is opaque to launch parsing, so unmatched quotes and text that looks like another launch clause are passed to the task without parser errors. Quoting remains validated in launch clauses and the task-path token. `parseAgentCommand` reports parser failures with these exact messages:

- An unterminated quoted value in a launch clause or task path: `Agent: malformed quoted value.` Unterminated quotes in the parameter tail are preserved without an error.
- A missing value after a named clause: `Agent: missing value for on.`, `Agent: missing value for with.`, `Agent: missing value for using.`, `Agent: missing value for with <clause>.`, or `Agent: missing value for using <clause>.` The clause name is the lowercased token following `with` or `using`; `with skill` is the supported skill form.
- A missing value after `in`: `Agent: missing value for in <clause>.`, where `<clause>` is the lowercased token after `in`, or empty when it is absent (yielding `Agent: missing value for in .`).
- An unsupported named clause: `Agent: unknown clause "with <clause>".` or `Agent: unknown clause "using <clause>".` An empty quoted clause produces `Agent: unknown clause "with ".` or `Agent: unknown clause "using ".`
- An unsupported location clause: `Agent: unknown clause "in <clause>".` The clause is the lowercased token after `in`; an empty quoted clause produces `Agent: unknown clause "in ".`
- A repeated singleton clause: `Agent: duplicate clause "on".`, `Agent: duplicate clause "in a tab".`, `Agent: duplicate clause "in group".`, `Agent: duplicate clause "in workspace".`, `Agent: duplicate clause "using model".`, or `Agent: duplicate clause "with effort".` Repeated `with skill` clauses are allowed.
- A token that is not a launch clause before `execute`: `Agent: expected launch clause or final execute, got "<token>".` The token is shown without its surrounding quotes.
- An invocation without `execute`: `Agent: missing execute clause.`
- An invocation without a nonempty task after `execute`: `Agent: missing task after execute.`

Selector existence checks for groups, workspaces, models, and effort values belong to their execution owners.

### Task resolution

A bare task filename is matched recursively by basename under the execution workspace's `ai/tasks/` first. If it has no match there, the execution host's installed `ai/tasks/` is searched. Only the source needed at each stage is walked, so an installed task-tree error cannot prevent a project match from resolving. Multiple matches in the selected source stop resolution with `Agent: ambiguous task "<value>": <matching paths>.`; ambiguity does not fall through to the installed source. No match reports `Agent: unknown task "<value>".`

Before a source is searched, its `ai/tasks/` root must resolve inside that source's allowed root: the execution workspace for project tasks or the installed `ai/tasks/` root for installed tasks. An escaping root fails resolution before its entries are inspected, with `Agent: task root outside allowed roots "<source>".`, where `<source>` is `project` or `janissary`.

An explicit path is resolved relative to the execution workspace unless it begins with `$janissary/`, which expands against the execution host's installation root. After resolving symlinks, the file must remain inside the execution workspace or the installed `ai/tasks/` directory, and the installed task directory itself must remain inside the canonical installation root. An outside path reports `Agent: task path outside allowed roots "<value>".` and is not read.

Task discovery is strict for each source when agent execution searches it. An absent `ai/tasks/` root has no matches, but another filesystem error fails resolution: an unreadable project tree fails before installed fallback, and an unreadable installed tree fails when project lookup found no match and installation must be searched. A source that is not needed is not walked. The task picker remains tolerant of unreadable or absent roots. The task's text is captured when resolution completes; later edits do not change that result.

### Skills and command grants

Each requested `skills/<name>/SKILL.md` is resolved from the execution workspace first, then the execution host's installed skills. The canonical `skills/` root must remain within its corresponding execution workspace or installation root. After resolving symlinks, the skill directory, its `SKILL.md`, and any grant sidecar must remain within the selected skill directory; an escaping root or path reports `Agent: invalid skill path "<name>".` before its contents are read. A missing skill reports `Agent: unknown skill "<name>".` Repeated names are deduplicated. A skill does not implicitly load other skills mentioned in its instructions.

An optional `janissary.json` beside the selected skill declares command grants. Version 1 has the shape `{"version":1,"commands":["question"]}`. The command list contains whole canonical Janissary command names; names are normalized to lowercase and duplicate grants are removed. Prefixes, unknown names, malformed JSON, unsupported versions, and malformed command lists fail resolution. A skill without a sidecar grants no commands.

Task text, skill instructions, and effective grants are captured as an immutable launch snapshot. Later edits to any task, skill, or sidecar cannot widen an existing snapshot.

### Resolution errors in this stage

This stage emits the approved errors `Agent: unknown <kind> "<value>".` and `Agent: ambiguous <kind> "<value>": <matching paths>.` for task and skill resolution, with the exact task-path confinement error stated above. Malformed grants report `Agent: malformed skill grants "<name>".`; an undeclared command reports `Agent: unknown command grant "<command>" in skill "<name>".` Parser errors identify malformed or missing launch syntax. Validation that a well-formed group, workspace, model, or effort exists is performed by later launch stages.

### Run ownership and local workspace references

Each run has an independent identity and lifecycle. Closing the caller tab terminates its active runs, including when closing that tab exits the application. Closing a monitoring tab only detaches monitoring and leaves execution running. A caller identity includes the tab incarnation captured at launch, so a later tab reusing the same label cannot become the original caller.

A resource registered after its run has ended is disposed once and rejected with `Agent run has already ended.`. A failure from that late disposer is contained and does not change the run's settled cleanup result.

A borrowed workspace must already be tracked by Janissary. The run retains one reference and releases only that reference during cleanup; other tabs and runs keep their references. Cleanup is idempotent and attempts every owned release even if one fails. Shutdown awaits active-run cleanup before disposing the services those runs use, and concurrent shutdown requests share the same completion.

### Local task execution

`agent` is a canonical application command. Local runs provision a fresh workspace clone by default and wait for it to be ready before resolving and snapshotting the task and requested skills there. Caller-directory task and skill files are not used by that run. If the caller is already running in a Janissary-tracked workspace, the run borrows that workspace and releases only its own reference after execution. An untracked caller directory is never borrowed. Task and skill lookup falls back to installed Janissary files as described above. The task text, parameter tail, and selected skill instructions are supplied to a new autonomous ACP session whose working directory and confinement root are the execution workspace. The caller's captured identity, working directory, and context remain the command invocation context for granted Janissary commands. If local workspace confinement is unavailable or disabled, the notifications feed receives `Agent: sandboxing is disabled.`. The default OpenCode model is used unless `using model <model id>` selects another catalog model. The requested effort is selected from the provider's advertised `thought_level` configuration before prompting, defaulting to `medium`. If the provider does not advertise that effort, execution fails with `Agent: unsupported effort "<level>" for model "<model>".`.

Autonomous provider tool permissions select the least expansive available approval option. Janissary commands use a separate whole-command grant check: only an exact canonical command name declared by a selected skill's sidecar may run. The agent requests a Janissary command on its final nonempty reply line as `janissary <command>`. A question request is available only when the `ask-user` skill is selected and grants `question`; the run waits for the answer or receives `Question cancelled.`. A denial is returned to the agent as tool output and does not authorize a different command.

Each run owns a new ACP process and returns only after it has completed cleanup. Closing the originating caller terminates the run and returns `Agent terminated.`. A provider failure or empty final answer produces a failed result. The structured result has `status`, `response`, and `cleanupWarnings`; the caller transcript shows `Status: <completed|failed|terminated>`, the response, and one `Cleanup warning: <reason>` line per cleanup issue. Cleanup warnings do not replace the task status or response.

### Remote task execution

`on <host>` runs an agent remotely only when the caller is already attached to an established remote workspace on that host. `in workspace <label>` selects another tab's established remote workspace. A missing, connecting, or mismatched target fails with `Agent: remote workspace is not ready.` or `Agent: requested remote host must match an established remote workspace.`; execution never falls back to the local machine or provisions a second workspace.

The remote host resolves the task and selected skills from its workspace and installed Janissary tasks/skills, then returns the captured snapshot before the run starts. Canonical command grants are still enforced locally. The remote hosts the autonomous ACP process with the selected model and effort, while the command loop and granted Janissary commands remain local. Remote activity is delivered to that run only.

A run holds an ephemeral reference to the shared remote channel and workspace. Releasing it does not close resources held by other tabs. Closing the caller, detaching the remote session, or losing transport aborts the run. Readiness waits at most 15 seconds; remote ACP release waits at most 5 seconds. A close without a positive acknowledgment adds `Cleanup warning: Remote agent close was not acknowledged.` to the result.

### Run monitoring

With `in a tab`, the server opens a lazy `agent-monitor` tab titled `Agent: <task filename>` and binds it to the newly created run. The monitor shows the complete launch command, selected model and effort, execution workspace, status, provider-reported activity, and final response. It has no terminal, command bar, or prompt input. Activity includes reported message, thought, tool, plan, and permission updates, in the order received; message text also remains the source for command extraction and the final answer.

The server owns one run projection and revision. Monitor updates are coalesced and sent only to the monitor tab; its latest projection is also included in the initial state after reconnect. Older revisions for the same run are ignored. The projection and termination operation are scoped to the run bound to that monitor tab. Requests carry no run id, and a monitor cannot select or inspect another run.

`Terminate` ends only the bound run. It is disabled after cleanup begins. Closing the monitor tab or disabling the monitor plugin detaches observation and does not terminate execution. Closing the originating caller still terminates the run.
