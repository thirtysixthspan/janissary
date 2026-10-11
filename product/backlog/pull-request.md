<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap that lets workspace-controlled symlinks redirect application-side OAuth writes outside the scratch directory.

Existing Issue: OAuth provisioning follows intermediate directory symlinks in the workspace-writable temporary tree, so a running workspace can remove its private auth file, replace its OpenCode directory with a symlink to a sandbox-denied host directory, and cause the application's next workspace spawn to create an auth file there. Severity: 8/10

Existing Risk: 8/10 - A confined process uses the unconfined application's cached credentials and filesystem authority to create an OAuth file outside its allowed workspace and scratch paths.

Proposal Risk: 3/10 - Initial credential provisioning still writes a secret to disk, and a missed ancestor swap would reopen the write boundary, so containment and lifecycle tests must cover the trusted root as well as the final file.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1671 "prevent workspace symlinks from redirecting privileged OAuth provisioning". In src/sandbox/opencode-data.ts, src/sandbox/environment.ts, and src/sandbox/index.ts, retain the intended workspace scratch path rather than treating a symlink's resolved target as a newly trusted root; reject symlinked roots, intermediate credential directories, and existing auth files that resolve outside that root. Exclusive creation with flag wx protects the final filename but does not protect intermediate directories. Establish and record the initial seed through the workspace owner before untrusted children run, using src/workspace/index.ts and src/workspace/manager.ts as the lifecycle boundary, so later spawns preserve refreshed credentials without re-seeding after a child deletes or redirects the file. Ensure the write strategy cannot follow a substituted ancestor between validation and creation, and make workspaceOpencodeDataHome refuse unsafe redirected paths too. Add regression fixtures wholly inside the project that represent a workspace scratch tree and a separate host directory, replace each credential-path component with a symlink, and verify neither seeding nor a later spawn creates or modifies a file in the separate directory. Retain the existing refreshed-token, separate-workspace, browser-exclusion, and cleanup cases in src/sandbox/opencode-data.test.ts; ordinary credential tests do not currently cover this boundary. Verify through the diff-scoped checks when implementing the finding without widening sandbox permissions.


* Handle OAuth staging failures without preventing unrelated workspace processes from launching.

Existing Issue: Directory creation and credential writes can throw through workspaceEnv into every workspace spawn when the optional OpenCode data directory is unwritable or malformed, including launches of shells and other harnesses that do not need ChatGPT OAuth. Severity: 5/10

Existing Risk: 5/10 - A filesystem collision or credential-staging error turns a saved Codex login into a prerequisite for otherwise working shell, harness, or ACP launches.

Proposal Risk: 2/10 - An OpenCode launch can still require the user to repair its credential directory, but an explicit credential-specific report can expose that failure without blocking other authentication routes or unrelated processes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1671 "isolate optional OpenCode OAuth staging failures from workspace launches". Add an explicit failure result for preparation in src/sandbox/opencode-data.ts and handle it at src/sandbox/environment.ts so failed staging adds no XDG_DATA_HOME override, preserves ambient data-home settings and existing API-key injection, and does not abort an unrelated process through src/sandbox/index.ts. Surface a bounded credential-specific notification through the established host notification path without including token contents, and avoid treating a partially created auth file as a successfully provisioned copy on the next launch. Keep unsafe-path rejection distinct from a successful credential lookup and coordinate this handling with the symlink containment finding. In src/sandbox/opencode-data.test.ts, add deterministic failures for an intermediate path occupied by a regular file, mkdir failure, and a write failure that leaves partial output; verify shell and non-OpenCode harness launches retain their normal command and environment, failed OAuth does not install a redirect, and a later legitimate attempt is not trapped by incomplete output. The existing tests cover absent source credentials but no destination failure. Update the affected authentication spec to state the user-visible failure behavior and run the diff-scoped checks when implementing it.


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
