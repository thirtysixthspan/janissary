<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Scope the security repair plan's goal to the spawns that actually take a workspace or ACP credential.

Existing Issue: `product/plans/complete/keep-search-keys-out-of-spawned-environments.md` opens by promising that neither search key may appear "in the environment of any process Janissary spawns, whether the value came from a token file or from the server's own ambient environment", while its own Out of scope deliberately leaves plain non-workspaced shells and other spawns that take no workspace credential with the user's own environment, and `withWorkspaceCredentials` returns that environment untouched when `workspaceDir` is absent. Severity: 2/10

Existing Risk: 2/10 - a future reader trusts a guarantee broader than the one the code keeps and either builds on a scrub that does not happen for a plain tab or treats the delivered workspaced and ACP coverage as incomplete.

Proposal Risk: 1/10 - the plan states the delivered boundary and points at the Out of scope bullet; the code, tests, specs, and user documentation are unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "scope the search-key repair plan's goal to workspaced and ACP spawns". In `product/plans/complete/keep-search-keys-out-of-spawned-environments.md`, replace the Goal's first sentence with a claim scoped to the spawns that take a workspace or ACP credential: neither key may appear in the environment of a workspaced shell, harness, or ACP agent, whether the value came from a token file or from the server's own ambient environment. State in the same paragraph that a plain non-workspaced spawn keeps the user's own environment, matching the existing Out of scope bullet. Leave every implementation step, design decision, test, and the rest of the file as it is, and change no code, test, spec, help page, or user documentation. Verify the scoped sentence against `src/sandbox/environment.ts` (`tokenVariables`, `agentCredentialEnv`, `withWorkspaceCredentials`, `withoutServerOnlyCredentials`), `src/sandbox/index.ts` (`sandboxSpawn` returns its input unchanged with no `workspaceDir`), `src/acp/index.ts` (`connectAcp` passes the working directory as the workspace directory), and the existing `src/sandbox/environment.test.ts`, `src/sandbox/harness-spawn.test.ts`, and `src/sandbox/index.test.ts` cases.
