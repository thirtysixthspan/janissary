# Run an autonomous task

Use `agent` to run an AI task and wait for its final result:

```text
agent with skill ask-user using model google/gemini-3.1-flash-lite with effort medium execute research/find-bugs.md --area "command dispatch"
```

Launch options can appear in any order before `execute`. A local run creates a fresh workspace clone and looks for its task and selected skills there before falling back to Janissary's installed files. The clone is shallow: it holds the newest ten commits of each branch, so a task that needs older history can run `git fetch --unshallow` inside it. Files in your current directory are not copied into the new workspace or used for lookup. If you are already running in a Janissary-tracked workspace, the run uses that workspace and releases its own reference when it ends. Text after the task filename is passed to the task unchanged. The default model is the OpenCode model from the harness catalog, and the default effort is `medium`. The selected model must advertise the requested effort or the run reports `Agent: unsupported effort "<level>" for model "<model>".`.

Use `in workspace <label>` to select another tracked local workspace. The run waits for an in-progress clone and releases only its own reference. If the name is missing or untracked, the command reports `Agent: unknown workspace "<label>".`

<img class="agent-float" src="/agents/selim-south.png" alt="" />

Select a skill with `with skill <name>`. Its instructions are included with the task. A skill can grant whole Janissary commands through a `janissary.json` file beside `SKILL.md`:

```json
{"version":1,"commands":["question"]}
```

Only listed canonical command names are allowed. The agent asks to run one by ending a reply with `janissary <command>`. Questions require the `ask-user` skill and its `question` grant; the task waits until you answer or cancel.

The command returns `Status: completed`, `failed`, or `terminated`, followed by the task response. Cleanup issues appear on separate `Cleanup warning:` lines. When you type the command in a command bar, such as a shell tab's, those same lines appear beneath the command line as its reply. Closing the caller tab terminates its run.

Your caller tab stays in its original directory; the agent's files and ACP session use the execution workspace. Commands the agent is allowed to run still use your caller tab's directory and context as they were when the run started, not the execution workspace's. If the execution host cannot confine the agent because workspace sandboxing is disabled or unavailable, the notifications feed shows `Agent: sandboxing is disabled.`. For a remote run, this reflects the remote host's confinement state.

Use `on <[user@]host[:path]>` to run remotely from either a local or remote caller. Janissary reuses an established remote workspace only when the full SSH destination matches, including its user: `admin@devbox` and `devbox` are separate destinations. Otherwise, it connects over SSH and looks for your project from the remote login directory. Adding `:path` always selects that project path through a run-only connection, even if a workspace for the same destination is already open. Remote-only connections use non-interactive SSH authentication, so unavailable hosts fail the run rather than leaving it waiting for a password prompt. A remote caller can use `in workspace <label>` without `on` to borrow another established remote workspace. The task and selected skills are resolved on the execution host. Janissary keeps command grants and tool commands on the original caller's machine. If the remote does not answer readiness or confirm close, the run fails or reports a cleanup warning rather than waiting indefinitely.

Add `in a tab` to open a read-only monitor while the task runs. The tab is titled `Agent: <task filename>` and has no command bar. It shows the launch command, model and effort, execution host and workspace, status, reported activity, and the final response. Local runs show `Local` and their execution workspace; remote runs show the remote host and workspace.

Activity lists the agent's messages, thoughts, tool calls, plans, and permission requests in the order they arrive, each labeled with its kind. Other session bookkeeping updates are not shown, and a local run and a remote run report the same activity for the same updates.

Select **Terminate** to stop that run. The button is disabled once cleanup begins, and the status stays `Terminated` through cleanup. Closing the monitor only closes the view; the task continues, and you can still collect its result in the caller tab.

Add `in group <name|id>` to place that monitor in an existing tab group. Names match without regard to case; numeric IDs select a group by number. A group that isn't open, or an invalid ID, fails before the task starts with `Agent: group "<selector>" does not exist.` This check also applies when the run is headless. Without a group selector, the monitor joins the caller's group.

## Fix a failed launch

<img class="agent-float left" src="/agents/hamza-south-east.png" alt="" />

If you leave out `execute`, Janissary reports `Agent: missing execute clause.` If you add `execute` without a task name, it reports `Agent: missing task after execute.` Add the missing part before trying again.

When a bare task filename matches multiple files in your project's `ai/tasks/` folder, Janissary reports `Agent: ambiguous task "<value>": <matching paths>.` Rename or remove the duplicate project task. Janissary stops at that ambiguity instead of looking for the task in its installed task folder. If no task matches, it reports `Agent: unknown task "<value>".`

If you add `in a tab` but Janissary can't open the monitor, the run fails before the task starts and the result shows the reason, such as `Agent: no monitoring plugin is available.` or `Agent: could not open monitoring tab.` Remove `in a tab` to run without a monitor, or retry after the monitor is available.

### Check launch syntax and paths

You can repeat `with skill <name>` to select more than one skill. Other launch clauses are single-use: `on`, `in a tab`, `in group`, `in workspace`, `using model`, and `with effort`. Repeating one reports an error such as `Agent: duplicate clause "using model".` Put quotes around a launch value that contains spaces, such as `in workspace "my project"`. An unmatched quote reports `Agent: malformed quoted value.`

Each clause needs its value. For example, `on execute` reports `Agent: missing value for on.`, and `in group execute` reports `Agent: missing value for in group.` The other clauses name themselves the same way, such as `Agent: missing value for with skill.` or `Agent: missing value for using model.` An unsupported option such as `with format fast` reports `Agent: unknown clause "with format".`, and an unsupported location such as `in room west` reports `Agent: unknown clause "in room".` A word before `execute` that is not a launch option reports `Agent: expected launch clause or final execute, got "<token>".` Use the documented forms, such as `with skill`, `using model`, and `in workspace`. Text after the task name is task input, so launch-looking words there are not parsed as options.

For an explicit task path, use a file inside the execution workspace, or a path under `$janissary/ai/tasks/`. A path outside those locations, including one that resolves outside through a link, reports `Agent: task path outside allowed roots "<value>".`

If a selected skill can't be used, `Agent: unknown skill "<name>".` means it wasn't found; `Agent: invalid skill path "<name>".` means its path isn't valid. Repeating a skill name has no effect, and mentioning another skill in a skill's instructions does not select it. A malformed `janissary.json` grant file reports `Agent: malformed skill grants "<name>".` An unrecognized command in that file reports `Agent: unknown command grant "<command>" in skill "<name>".`

If an agent's final command-looking line appears inside a Markdown code fence, Janissary treats it as an example rather than a request to run the command. This applies to fences made with backticks or tildes.

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

### What the task can find

A bare task filename is searched by basename under the execution workspace's `ai/tasks/` folder first, including its subfolders. If it has no match there, Janissary searches its installed tasks. More than one match in the selected folder is an error. Janissary reports `Agent: ambiguous task "<value>": <matching paths>.` and does not search the installed tasks as a fallback. If nothing matches, it reports `Agent: unknown task "<value>".`

For a path, use a file inside the execution workspace or under `$janissary/ai/tasks/`. Janissary follows links before checking the allowed roots. A path outside them reports `Agent: task path outside allowed roots "<value>".` A task lookup also checks that the `ai/tasks/` folder itself stays inside its allowed root. If your project's folder, or the installed one, resolves outside it, such as through a link, lookup stops with `Agent: task root outside allowed roots "project".` or `Agent: task root outside allowed roots "janissary".` A missing `ai/tasks/` folder just has no matches, but one that exists and can't be read fails the lookup, and the installed tasks are only searched when your project has no match. Task text is read when the run resolves the task, so later edits do not change that run's task.

Skills are searched in the execution workspace and then in Janissary's installed skills. A skill's `SKILL.md` and optional `janissary.json` grant file must stay inside that skill's folder. A skill does not load other skills just because its instructions mention them. Selected skill instructions and grants are captured with the task when the run starts.

The optional `janissary.json` file beside `SKILL.md` can grant whole Janissary commands:

```json
{"version":1,"commands":["question"]}
```

The names must be canonical commands. Janissary trims each name and ignores its case, so `Question` grants `question`, and a command granted by more than one selected skill is counted once. Prefixes, unknown commands, invalid JSON, or an unsupported version fail the launch. A skill without this file grants no commands. A nested agent can select only skills with the same source, name, and instructions as its parent's captured skills. Any other skill reports `Agent: nested skill "<name>" is outside the parent policy.` Its grants are limited to the commands both runs allow, so it cannot gain access by selecting another skill.

### Run results and cleanup

The task receives the parameter text after its filename unchanged, including leading spaces, unmatched quotes, or words that look like launch options. Launch options are parsed only before the task filename.

The agent can request a granted command on the final nonempty reply line as `janissary <command>`. The command must be explicitly granted by a selected skill. A denial is returned to the agent and does not grant another command. Autonomous providers use the least expansive available tool-approval option. If the provider fails or returns an empty final answer, the run is marked failed.

Closing the tab that launched the task terminates its run. Closing the monitor only closes the view; execution continues. A parent run owns nested runs it starts. Ending the parent stops its active children and waits for them to finish cleanup before the parent's own cleanup completes; a child that already finished needs no second cleanup. Tabs created by a run's granted commands close during cleanup. A tab that was already open, or one the command only focused, stays open. Cleanup releases the run's workspace reference and attempts each owned cleanup even if another one fails. Cleanup warnings appear after the result without changing its status.

### Remote task cleanup

Use `on <[user@]host[:path]>` to execute the task on another machine. A pathless address reuses an established remote workspace only when the full SSH destination matches, including the user name. Otherwise Janissary opens a run-only SSH connection and finds the project from the remote login directory. Supplying `:path` always opens a run-only connection and uses that path. A run-only connection's workspace clone is shallow in the same way as a local one, holding the newest ten commits of each branch. SSH authentication is non-interactive, and a remote failure never falls back to local execution. If a run-only connection isn't ready within 15 seconds, the run fails with `Agent: remote workspace readiness timed out.` If you close the caller or terminate the run while Janissary is still connecting, it releases that connection and starts no run.

The remote host resolves and snapshots the task and skills, then runs the autonomous process. Granted Janissary commands still run on your original machine with the caller's captured context. Remote activity is delivered only to this run. A remote that fails to report readiness in 15 seconds, or acknowledge close within 5 seconds, does not leave the run waiting indefinitely. If close is not acknowledged, the result includes `Cleanup warning: Remote agent close was not acknowledged.`
