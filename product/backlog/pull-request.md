<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's rejection of malformed access-token JWTs before provisioning OAuth.

Existing Issue: The access-token parser checks only the segment count and payload, so tokens with an empty header or signature, or invalid base64url characters that Buffer decoding ignores, can be accepted despite the plan and spec promising to ignore malformed credentials. Severity: 4/10

Existing Risk: 4/10 - A corrupted saved token activates the private data-home redirect and gives OpenCode unusable credentials instead of leaving the existing authentication setup intact.

Proposal Risk: 1/10 - Overly strict token syntax could reject a valid provider token, which fixtures for ordinary base64url JWTs and expired access tokens would expose.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1671 "reject malformed JWT segments in the Codex OAuth bridge". In src/project/opencode-oauth.ts, require three nonempty JWT segments with valid base64url syntax before decoding the payload, retaining the existing object and finite numeric expiry checks and seconds-to-milliseconds conversion. This is syntax validation of a trusted saved credential, not a new signature-verification or token-refresh subsystem. Extend src/project/opencode-oauth.test.ts with empty-header and empty-signature tokens carrying an otherwise valid expiry, illegal characters that the permissive Buffer decoder currently discards, and invalid decoded payload shapes; add a workspace staging assertion in src/sandbox/opencode-data.test.ts that these sources produce neither an auth file nor a redirect. Preserve valid conversion and expired-token refresh inputs. The current malformed-token cases do not cover these accepted shapes. Run the diff-scoped checks during implementation.


* Remove the introduced transcript dependency on ambient data-home settings when a caller supplies a fixture home.

Existing Issue: The OpenCode transcript constructor now prefers process.env.XDG_DATA_HOME over its explicit home argument, causing the existing tests that inject a temporary home to read a different database whenever that environment variable is set. Severity: 5/10

Existing Risk: 5/10 - Running the server tests from a newly authenticated workspaced OpenCode process or a normal XDG-configured environment breaks fixture isolation and queries the workspace or user's session database instead of the test database.

Proposal Risk: 2/10 - Moving environment resolution to the factory can select the wrong location if workspace precedence is changed, which explicit ambient-versus-workspace fixtures can detect.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1671 "preserve explicit transcript storage injection under XDG_DATA_HOME". Make src/harness/transcript/opencode.ts derive its default data directory from the supplied home without consulting process.env, while retaining an explicit data-home override for callers that need one. Resolve the launch's ambient XDG_DATA_HOME at the application edge in src/harness/transcript/sources.ts and pass it explicitly only when no workspace-private data home applies, so production launches still match OpenCode's storage while direct constructor calls remain deterministic. Add a case in src/harness/transcript/opencode.test.ts that sets XDG_DATA_HOME to a different project-local fixture, constructs the source with an explicit fake home, and verifies that the injected home's database is the one read; restore the environment after the case. Keep the ambient data-home factory test and local and remote workspace transcript tests in src/harness/transcript/sources.test.ts passing, and add a precedence case where both ambient and workspace storage exist. The existing constructor tests currently assume the home injection controls storage but never exercise a nonempty ambient data home. Verify through the diff-scoped checks when implementing this change.
