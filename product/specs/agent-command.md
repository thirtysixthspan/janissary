# Agent command

### Launch grammar

The command accepts launch clauses in any order, followed by `execute <ai task> <parameters...>`. Usage is `Usage: agent [launch options] execute <ai task> [parameters...].` Supported clauses are `on <host>`, `in a tab`, `in group <name|id>`, `in workspace <label>`, repeated `with skill <name>`, `using model <model id>`, and `with effort <level>`. Quoted values may contain spaces. Singleton clauses cannot repeat; skill clauses may repeat and resolve once. Group-only selection is valid for a headless launch.

The task path ends the launch header. Everything after it is the task parameter tail, including text that looks like another launch clause. `parseAgentCommand` reports parser failures with these exact messages:

- An unterminated quoted value: `Agent: malformed quoted value.`
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

A bare task filename is matched recursively by basename under the execution workspace's `ai/tasks/` first. If it has no match there, the execution host's installed `ai/tasks/` is searched. Multiple matches in the selected source stop resolution with `Agent: ambiguous task "<value>": <matching paths>.`; ambiguity does not fall through to the installed source. No match reports `Agent: unknown task "<value>".`

An explicit path is resolved relative to the execution workspace unless it begins with `$janissary/`, which expands against the execution host's installation root. After resolving symlinks, the file must remain inside the execution workspace or the installed `ai/tasks/` directory. An outside path reports `Agent: task path outside allowed roots "<value>".` and is not read.

Task discovery is strict for agent execution: an unreadable task tree fails resolution instead of being treated as empty. The task picker remains tolerant of unreadable or absent roots. The task's text is captured when resolution completes; later edits do not change that result.

### Skills and command grants

Each requested `skills/<name>/SKILL.md` is resolved from the execution workspace first, then the execution host's installed skills. A missing skill reports `Agent: unknown skill "<name>".` Repeated names are deduplicated. A skill does not implicitly load other skills mentioned in its instructions.

An optional `janissary.json` beside the selected skill declares command grants. Version 1 has the shape `{"version":1,"commands":["question"]}`. The command list contains whole canonical Janissary command names; names are normalized to lowercase and duplicate grants are removed. Prefixes, unknown names, malformed JSON, unsupported versions, and malformed command lists fail resolution. A skill without a sidecar grants no commands.

Task text, skill instructions, and effective grants are captured as an immutable launch snapshot. Later edits to any task, skill, or sidecar cannot widen an existing snapshot.

### Resolution errors in this stage

This stage emits the approved errors `Agent: unknown <kind> "<value>".` and `Agent: ambiguous <kind> "<value>": <matching paths>.` for task and skill resolution, with the exact task-path confinement error stated above. Malformed grants report `Agent: malformed skill grants "<name>".`; an undeclared command reports `Agent: unknown command grant "<command>" in skill "<name>".` Parser errors identify malformed or missing launch syntax. Validation that a well-formed group, workspace, model, or effort exists is performed by later launch stages.
