<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan-fidelity requirement for exact parser-error wording in the behavior spec.

Existing Issue: The completed subplan requires exact errors in the behavior spec, but `product/specs/agent-command.md` only describes parser errors generally while `src/agent/command-parser.ts` emits distinct strings for malformed quotes, unknown clauses, and unexpected launch tokens. Severity: 4/10

Existing Risk: 4/10 - Callers and maintainers can rely on different error wording because the spec does not state the messages the parser actually returns.

Proposal Risk: 2/10 - Documenting the parser's exact errors would align the behavior contract with the implementation, though later parser changes could still create drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "document the exact agent parser errors". Update `product/specs/agent-command.md` with the literal errors returned by `parseAgentCommand` in `src/agent/command-parser.ts`, including malformed quoted values, unknown clauses, missing clause values, unexpected launch tokens, missing `execute`, and missing task. Keep the documented wording synchronized with parser behavior and add or retain assertions in `src/agent/command-parser.test.ts` for each documented message. Verify every parser error path has an exact spec entry and that unrelated launch grammar remains unchanged.


* Fix the functionality gap where an unreadable installed task tree blocks a project match.

Existing Issue: `findBareTask` calls strict `listTasks` for both roots before applying project-first precedence, so an error walking installed `ai/tasks/` prevents resolution even when the requested task already exists in the execution workspace. Severity: 5/10

Existing Risk: 5/10 - A damaged or unreadable installation task directory can make valid project tasks unlaunchable despite the documented rule that installation lookup occurs only when the project has no match.

Proposal Risk: 2/10 - Searching the project source first and consulting the installed source only on a miss restores the stated precedence, while strict errors still fail a lookup when an unreadable source is actually needed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "preserve project-first agent task lookup". In `src/agent/task-resolution.ts`, resolve bare task names from the execution workspace first and only enumerate the installed task root when the project has no matching filename; preserve ambiguity errors within the selected source. Adjust `src/tasks.ts` strict discovery only as needed to retain tolerant task-picker behavior and surface errors for a source that is searched. Add tests in `src/agent/task-resolution.test.ts` proving a project match succeeds when installed task discovery fails, while an installed fallback still reports an unreadable installed root. Existing recursive lookup, ambiguity, and fallback assertions must continue to pass.


* Close the security gap that lets a selected skill consume instructions or grants from another directory.

Existing Issue: `resolveSkill` confines the resolved `SKILL.md` only to the shared `skills` root, and `readGrants` follows `janissary.json` without checking its real path, allowing one selected skill to consume another skill's file or sidecar through a symlink. Severity: 7/10

Existing Risk: 7/10 - A skill can source a different skill's grant declaration, expanding the selected run's Janissary command permissions beyond the grants belonging to the selected skill.

Proposal Risk: 2/10 - Requiring both resolved files to remain within the selected skill directory prevents sibling or outside symlinks from supplying instructions or grants, though valid content inside that directory remains trusted input.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine agent skill files and grants". In `src/agent/skill-grants.ts`, resolve and validate the selected `skills/<name>` directory, require the real `SKILL.md` and any existing `janissary.json` to remain beneath that directory, and reject escaping symlinks before reading either file. Keep the current behavior where an absent sidecar grants no commands. Add tests in `src/agent/task-resolution.test.ts` for a skill-file symlink to a sibling skill and a sidecar symlink to a sibling or outside file, asserting rejection before the target is read; retain the existing workspace-first, installed fallback, and no-sidecar grant tests.
