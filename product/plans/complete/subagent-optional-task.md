# Make the subagent task an optional parameter

**Complexity: 6/10** — ~35 added lines across 4 production files, ~10 behavioral requirements and ~16 test scenarios (p=5.781)

## Goal

`subagent` currently refuses an invocation without `--task` / `"task"`. The task file should be an option, not a requirement: a person or an ACP caller may launch a subagent by naming only a role and giving the assignment inline through `--context` / `"context"`. When a task file is named, behavior is exactly as today. When it is omitted, the context text is used directly as the subagent's instructions, with no task-file lookup, and the run is titled `Subagent: inline` so records and connection rows remain readable.

## Design decisions

- `role` stays required. At least one of `task` and `context` must be present and non-blank; with neither, the caller receives its own usage line. This keeps a subagent from starting with no instructions at all.
- Omitting `task` is valid in both forms: `subagent --role research --context "Investigate the parser"` and `subagent {"role":"research","context":"Investigate the parser"}`. Supplying both keeps today's meaning: the task file is the instructions and the context is extra directions appended after it.
- When `task` is omitted, no task resolution happens — locally or remotely. The snapshot's `taskText` is the context verbatim and the context is not appended a second time, so the subagent prompt is the existing lead-in followed once by the inline instructions.
- The inline snapshot's `taskPath` is the stable selector `inline`. The same selector is written into the run's placeholder snapshot at launch, so the durable record title is `Subagent: inline` from the moment the receipt is returned; a later snapshot replacement does not change it.
- Usage lines change to show the new grammar: the flag line brackets `--task`, and the JSON line shows the minimal no-task form (`{"role":"<role>","context":"<text>"}`). Both remain caller-specific and are emitted by the same parse failure paths as before.
- The ACP primer is updated to say the task is optional when context supplies the assignment. No new field, flag, or protocol shape is introduced.

## Implementation

1. In `src/subagent/parse.ts`, make `task` optional on `SubagentFields`, update `SUBAGENT_FLAG_USAGE` and `SUBAGENT_JSON_USAGE`, and change the flag and JSON validation so `role` plus at least one of `task`/`context` is required. An empty `context` alone still fails; an empty `task` supplied explicitly still fails as today. Run check-diff.
2. In `src/subagent/command-policy.ts`, widen the launch options to carry an omitted task through unchanged. Run check-diff.
3. In `src/subagent/launch.ts`, make `task` optional on `SubagentLaunchOptions` and `Continuation`. Define the `inline` selector constant. At launch use it for the placeholder `taskPath` in both the remote run snapshot and `startLocalAgentRun`. In `continueLaunch`, when `task` is omitted, build the snapshot directly with `taskText: context` and skip task resolution (local and remote alike), and pass `context: undefined` into `executeSubagentRun` so the inline text is not appended twice. Run check-diff.
4. In `src/subagent/primer.ts`, update `SUBAGENT_PRIMER` so the JSON grammar describes `task` as optional when `context` carries the assignment. Run check-diff.
5. Update `help/subagent.md`, `help/commands.md`, and `product/specs/subagent.md` for the new grammar and usage strings. Run check-diff.

No production file exceeds the 200-line limit after these edits; if one does, extract a module rather than compacting code.

## Tests

- **`src/subagent/parse.test.ts`**: flag form with no task and a context parses with `task` omitted; JSON form with no task and a context parses with `task` omitted; both forms with neither task nor context report their caller's usage line; empty/whitespace context alone is refused; the two updated usage constants are asserted exactly; all existing with-task cases stay valid.
- **`src/subagent/command-policy.test.ts`**: a no-task flag line and a no-task JSON line reach launch with `task` undefined and the context preserved; the no-task refusal is caller-specific.
- **`src/subagent/launch.test.ts`**: with no task, `resolveAgentSnapshot` and the remote resolve frame are not called; the run's snapshot carries `taskText` from the context; the prompt contains the inline text once; the record title is `Subagent: inline`; a remote no-task run still provisions its clone and executes; with-task behavior is unchanged.
- **`src/subagent/primer.test.ts`**: the primer teaches that `task` is optional when `context` supplies the assignment.
- Existing suites in `src/subagent/` must pass unchanged apart from the assertions intentionally updated above.

## Out of scope

- Changing the `agent` command's required task.
- Adding an inline task field distinct from `context`, or allowing task content in the flag form other than `--task <file.md>`.
- Changing the `role` requirement, caller-kind rule, grants, message contract, delivery queue, or any protocol version.
- Changing the connection-tab or terminal rendering.
- The second backlog entry (ACP tool-call rendering) is not part of this fix.

## Documentation and specification impact

`help/subagent.md` and `help/commands.md` document the usage lines, which change; both are updated in place. `product/specs/subagent.md` covers invocation forms, usage errors, the command primer, and records and names; those sections are updated in place. No new user-documentation page is created.
