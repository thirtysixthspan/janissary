# Add agent launch resolution

**Complexity: 5/10** — The bounded parser and resolver touch several modules, and real-path confinement, grant validation, and installed-package access need careful edge-case tests.

## Goal

Implement the pure `agent` launch parser and resolve task and skill inputs from the selected execution workspace or the execution host's Janissary installation. Establish `product/specs/agent-command.md` as the living behavior spec.

## Decisions and dependencies

This is the first implementation subplan; the later execution subplans depend on its parser and immutable resolution results. It has no dependency on those later subplans. Preserve the parent plan's launch contract exactly: launch clauses may appear in any order before mandatory final `execute <task> <parameters...>`, and the parameter tail is returned untouched. Resolve bare task filenames recursively in the execution workspace first, then the execution host's installation only if that source has no match; report ambiguity within the selected source without falling through. Explicit task paths must resolve inside the execution workspace or the execution host's installed `ai/tasks/` after real-path resolution. Resolve optional skills from the execution workspace before installed skills; repeated skill names deduplicate. A version-1 sidecar grants only validated canonical whole Janissary command names. Group-only selection is accepted for a headless run, while a supplied invalid selector is rejected.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Recursive task discovery and source tagging | `src/tasks.ts:11` (`walk`), `src/tasks.ts:49` (`listTasks`); `src/tasks.test.ts:45` (recursive listing) | Reuse the walker rather than add another. Add strict agent discovery while keeping `listOne`'s tolerant catch at `src/tasks.ts:36` (`listOne`) for the picker. Filter returned rows by basename for bare-name resolution, then apply source precedence and ambiguity rules. |
| Installed Janissary root | `src/janissary-root.ts:11` (`janissaryRoot`), `src/janissary-root.ts:19` (`janissaryAiDir`) | Resolve the installed task and skill roots on the execution host; do not derive them from the source checkout or caller machine. |
| Sandbox installation reads and dynamic path parameters | `src/sandbox/install-reads.ts:33` (`JANISSARY_AI_L/R`), `src/sandbox/index.ts:201` (`dualPath(janissaryAiDir())`), `src/sandbox/index.ts:222` (`JANISSARY_AI_L`), `src/sandbox/paths.ts:77` (`HOME_READ_CARVEINS`) | Extend the existing read-only confinement mechanism for selected installed skills and their support files. Bind literal and real paths; do not carve in the full installation or weaken `SECRET_DENY_PATHS`. |
| Published package contents | `package.json:84` (`files`); `src/chrome-extension.test.ts:41` (`package.json ships the extension directory`) | Add `skills/`; it is currently absent, so installed fallback would otherwise lack the bundled skills. Extend the existing package-files assertion for this rather than creating a second package-manifest test. |
| Bundled question skill | `skills/ask-user/SKILL.md:1` (`name: ask-user`), `skills/ask-user/SKILL.md:8` (`question` usage) | Add the version-1 `janissary.json` sidecar granting `question`; no sidecar currently exists. |

## Proposed changes

Add `src/agent/types.ts`, `src/agent/command-parser.ts`, `src/agent/task-resolution.ts`, and `src/agent/skill-grants.ts` as focused modules, with direct `.js` relative imports and no barrel. `src/agent/command-parser.ts` parses quoted tokens, launch clauses in arbitrary order, singleton duplicates, group-only headless selection, and mandatory final `execute`; it returns the task parameters exactly as entered after the task path. Reject malformed or missing clause values here; defer checking whether a well-formed group or workspace selector exists to the subplan that owns those registries. Resolve bare task filenames recursively with project-first source precedence and ambiguity errors within the chosen source. Add strict discovery for execution without changing the task picker's tolerant `listTasks` behavior. Validate explicit task paths against the real execution-workspace and installed-task roots before reading. Expand only the execution host's documented `$janissary` variable, not shell substitutions or environment variables with other names.

Resolve selected `skills/<name>/SKILL.md` from the execution workspace, then the execution host's installed skills. Do not recursively load skills mentioned by another skill. Validate the schema-version-1 JSON sidecar's object shape, version, and command list; reject malformed declarations and unknown canonical command names, normalize names, and deduplicate grants. A missing sidecar grants nothing. Snapshot task text, selected skill instructions, and effective grants as immutable results so later file edits cannot widen the grants. Add the `question` declaration to bundled `ask-user` and include `skills/` in published package files. Permit only selected installed skill directories and their support files through the existing read-confinement mechanism; retain the final secret denies.

Create `product/specs/agent-command.md` with the launch grammar, task and skill resolution rules, sidecar schema, and exact errors. Use the approved wording in `product/plans/ready/add-a-new-agent-command.md:47` (`Agent: unknown <kind> "<value>".` and `Agent: ambiguous <kind> "<value>": <matching paths>.`) where applicable; include the plan's approved usage text and explain which errors apply to this resolution subplan. Keep this spec current as later subplans add behavior.

## Tests

Add colocated `src/agent/*.test.ts` tests for quoted tokens, clause order, untouched parameter tail, required/final `execute`, duplicate singleton clauses, repeated skill deduplication, group-only headless parsing, and malformed or missing clause values. Cover recursive project-first task lookup, ambiguity without fallback, installed fallback, fresh-clone versus source edits, explicit allowed paths, symlink and outside-root rejection before reads, sidecar validation and missing sidecars, and immutable task/skill/grant snapshots. Test that sidecar entries name whole known canonical commands, never prefixes; command authorization and alias dispatch belong to the later execution subplan. Keep existing task-picker behavior covered by `src/tasks.test.ts` and extend its tests only if the shared discovery API changes. Extend the existing package-files assertion at `src/chrome-extension.test.ts:41` to require `skills/`. Verify selected installed-skill reads under confinement in the relevant sandbox tests, following `src/sandbox/index.test.ts`.

## Verification

`./scripts/run.mjs check-diff` passed after each source and test change. `npm pack --dry-run --json` confirmed `skills/ask-user/SKILL.md` and its sidecar ship. The sandbox tests verify selected installed-skill literal and real-path bindings and retain secret denies after the selected-path allow. A live confined scratch read could not run here because nested `sandbox-exec` returned `sandbox_apply: Operation not permitted`.

## Out of scope

Do not add another task directory walker, copy source-project changes into a fresh clone, enforce hard file or native skill-loader restrictions, add a YAML parser, or infer grants from prose or command prefixes. This subplan ends at parsing, task/skill resolution, grants, packaging, confinement, tests, and the behavior spec; do not add command execution, run ownership, ACP sessions, monitoring, or remote lifecycle behavior, which belong to later subplans.
