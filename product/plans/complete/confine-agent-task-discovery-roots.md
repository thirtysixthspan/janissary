# Confine Agent Task Discovery Roots

**Complexity: 5/10** — validate canonical task roots before strict traversal, with symlink regression cases and a behavior-spec update.

## Goal

Keep agent task discovery from enumerating task files outside the execution workspace or the installed task root.

## Approach

Before strict discovery walks either source, canonicalize its `ai/tasks` root and require it to remain within that source's allowed boundary. The project root must stay within the canonical execution workspace; the installed task root must stay within the canonical installed `ai/tasks` root. Preserve missing-root behavior, strict errors for inaccessible roots, project-first lookup, and installed fallback.

## Implementation steps

1. `src/agent/task-resolution.ts` validates each source's canonical task root before calling `listTasksFromRoot` and rejects escaping roots without including external paths in the error.
2. `src/agent/task-resolution.test.ts` covers project-root symlink escapes, including an outside tree with duplicate task basenames, and rejects installed task-root escapes before discovery.
3. `product/specs/agent-command.md` documents the task-root confinement error and strict discovery behavior.

## Tests

- A project `ai/tasks` symlink escaping the workspace is rejected before traversal, including when the outside tree contains duplicate basenames.
- An installed `ai/tasks` symlink escaping the installation is rejected before traversal.
- Project-first resolution and installed fallback remain unchanged for valid task roots.
- Missing roots remain empty, and inaccessible roots continue to fail strict discovery.
- Diff-scoped lint, typecheck, and tests passed after implementation.

## Out of scope

- Changing task picker behavior or its tolerant discovery.
- Changing task file validation or explicit task-path behavior.
- Changing the completed-plan verification-directive finding or the PR description.
