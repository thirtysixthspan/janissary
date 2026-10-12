<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Confine explicit installed-task paths to the installation even when its task root is symlinked outside.

Existing Issue: Explicit task resolution canonicalizes the allowed installed `ai/tasks` root with `realpathSync` and accepts files under that result without checking that the resolved root remains inside the installation. Severity: 8/10

Existing Risk: 8/10 - An installation whose `ai/tasks` path is redirected can cause an explicit `$janissary/ai/tasks/...` request to read a file outside the trusted installation boundary, bypassing the root confinement enforced for task discovery.

Proposal Risk: 2/10 - Explicit installed paths are checked against a validated installation-contained task root before any task file is read, while valid installed and workspace task paths continue to resolve normally.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine explicit installed-task paths to the installation root". In `src/agent/task-resolution.ts`, validate the canonical installed `ai/tasks` root against the canonical installation root before using it as an allowed root in `resolveTaskPath`; reject a root that escapes rather than treating its resolved destination as trusted. Preserve workspace-relative explicit paths and valid `$janissary/ai/tasks/...` paths. Add cases to `src/agent/task-resolution.test.ts` that symlink the installation's `ai/tasks` directory outside the installation and assert both `$janissary/ai/tasks/...` and an explicit path to a file under that redirected root fail before reading its contents. Keep the existing explicit allowed-path, task-root discovery escape, and outside-path tests passing; no current test covers explicit resolution through an escaping installed task root.
