<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap that lets a selected skill consume instructions or grants from another directory.

Existing Issue: `resolveSkill` confines the resolved `SKILL.md` only to the shared `skills` root, and `readGrants` follows `janissary.json` without checking its real path, allowing one selected skill to consume another skill's file or sidecar through a symlink. Severity: 7/10

Existing Risk: 7/10 - A skill can source a different skill's grant declaration, expanding the selected run's Janissary command permissions beyond the grants belonging to the selected skill.

Proposal Risk: 2/10 - Requiring both resolved files to remain within the selected skill directory prevents sibling or outside symlinks from supplying instructions or grants, though valid content inside that directory remains trusted input.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine agent skill files and grants". In `src/agent/skill-grants.ts`, resolve and validate the selected `skills/<name>` directory, require the real `SKILL.md` and any existing `janissary.json` to remain beneath that directory, and reject escaping symlinks before reading either file. Keep the current behavior where an absent sidecar grants no commands. Add tests in `src/agent/task-resolution.test.ts` for a skill-file symlink to a sibling skill and a sidecar symlink to a sibling or outside file, asserting rejection before the target is read; retain the existing workspace-first, installed fallback, and no-sidecar grant tests.
