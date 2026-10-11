<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the introduced transcript dependency on ambient data-home settings when a caller supplies a fixture home.

Existing Issue: The OpenCode transcript constructor now prefers process.env.XDG_DATA_HOME over its explicit home argument, causing the existing tests that inject a temporary home to read a different database whenever that environment variable is set. Severity: 5/10

Existing Risk: 5/10 - Running the server tests from a newly authenticated workspaced OpenCode process or a normal XDG-configured environment breaks fixture isolation and queries the workspace or user's session database instead of the test database.

Proposal Risk: 2/10 - Moving environment resolution to the factory can select the wrong location if workspace precedence is changed, which explicit ambient-versus-workspace fixtures can detect.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1671 "preserve explicit transcript storage injection under XDG_DATA_HOME". Make src/harness/transcript/opencode.ts derive its default data directory from the supplied home without consulting process.env, while retaining an explicit data-home override for callers that need one. Resolve the launch's ambient XDG_DATA_HOME at the application edge in src/harness/transcript/sources.ts and pass it explicitly only when no workspace-private data home applies, so production launches still match OpenCode's storage while direct constructor calls remain deterministic. Add a case in src/harness/transcript/opencode.test.ts that sets XDG_DATA_HOME to a different project-local fixture, constructs the source with an explicit fake home, and verifies that the injected home's database is the one read; restore the environment after the case. Keep the ambient data-home factory test and local and remote workspace transcript tests in src/harness/transcript/sources.test.ts passing, and add a precedence case where both ambient and workspace storage exist. The existing constructor tests currently assume the home injection controls storage but never exercise a nonempty ambient data home. Verify through the diff-scoped checks when implementing this change.
