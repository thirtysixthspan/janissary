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

A borrowed workspace must already be tracked by Janissary. The run retains one reference and releases only that reference during cleanup; other tabs and runs keep their references. Cleanup is idempotent and attempts every owned release even if one fails. Shutdown awaits active-run cleanup before disposing the services those runs use, and concurrent shutdown requests share the same completion.
