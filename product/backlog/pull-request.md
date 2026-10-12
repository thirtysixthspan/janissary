<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's unchanged task-parameter tail without parsing it as launch syntax.

Existing Issue: `parseAgentCommand` tokenizes the entire invocation before locating the task, so an unmatched quote in the task's parameter tail is rejected as a malformed launch value and the returned tail is also altered by `trimStart()`. Severity: 6/10

Existing Risk: 6/10 - Tasks that intentionally receive raw arguments containing unmatched quotes or significant leading whitespace cannot receive the invocation the caller entered.

Proposal Risk: 2/10 - Parsing only the launch header and task token leaves task-owned text outside launch validation, though callers may still need to interpret that raw text themselves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "preserve the raw task parameter tail". In `src/agent/command-parser.ts`, stop tokenizing after the `execute` task token and return the remainder according to the contract in `product/plans/complete/add-agent-command-01-resolution.md`; malformed quoting should remain an error in launch clauses and the task path, but not in task parameters. Keep all parameter content intact rather than trimming it. Extend `src/agent/command-parser.test.ts` to assert that unmatched quotes and significant whitespace after the task path are returned without parser errors, while retaining the existing malformed-launch-quote and ordinary-tail assertions.


* Keep skill resolution inside the execution workspace or installed skills root.

Existing Issue: `resolveSkill` canonicalizes `skills` and its selected child but never checks that the canonical `skills` root remains inside the execution workspace or Janissary installation, allowing a symlinked root to redirect instruction reads outside either permitted source. Severity: 7/10

Existing Risk: 7/10 - A workspace-controlled `skills` symlink can make a selected skill load arbitrary host-readable instructions into the agent despite the selected-skill path checks.

Proposal Risk: 2/10 - Anchoring the canonical skill root to its expected source prevents this redirection, while explicit user-selected content within the workspace or installation remains readable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine skill roots to their permitted sources". In `src/agent/skill-grants.ts`, validate the canonical workspace `skills` root against the canonical workspace and the installed `skills` root against the canonical installation before resolving a skill; reject an escaping root with `Agent: invalid skill path "<name>".` before reading either the skill file or sidecar. Add cases to `src/agent/task-resolution.test.ts` for workspace and installation `skills` roots symlinked outside their respective roots, and assert that external files are not read; retain the current selected-directory symlink, source-precedence, and absent-sidecar cases.
