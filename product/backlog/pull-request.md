<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Clear the technical debt of calling the remote-only `run` method on the session union in the manager tests without narrowing it.

Existing Issue: `AcpSessionManager.session()` now returns `AcpSession | RemoteAcpSession`, but `src/acp/manager.test.ts` calls `.run(...)` directly on that union in the ask/tell, non-fatal-error, and streaming cases; `AcpSession` has no `run`, so the test file fails a TypeScript check, and the repository's `tsconfig` excludes test files from `npm run typecheck`, hiding it. Severity: 2/10

Existing Risk: 2/10 - Enabling test typechecking or changing the session return type would break the suite, and the tests prove the session is remote only if the runtime call happens to fail.

Proposal Risk: 1/10 - Narrowing the union makes the assumption explicit; the tests keep the same assertions and no production code changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "narrow the remote session in the manager tests before calling run". In `src/acp/manager.test.ts`, add a small helper that takes the value returned by `acp.session(...)`, throws unless `'remote' in session`, and returns the narrowed `RemoteAcpSession`, or cast each result to `RemoteAcpSession` with a comment if the helper is not worth it. Use it at the three sites that call `.run` — the separate-ids case, the non-fatal-error case, and the streaming case — so the test states the remote assumption rather than relying on runtime failure. Import the type from `src/remote/acp-session.ts`; do not change `AcpSessionManager.session()`'s return type or any production code, and keep the existing frame and event assertions. Verify with the server test for `src/acp/manager.test.ts`; if the project ever typechecks test files, that check must pass too.
