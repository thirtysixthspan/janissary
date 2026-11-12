# Narrow the remote session in the manager tests before calling run

**Complexity: 1/10** — a test-only helper plus four call-site rewrites and one stale argument; no production files, no new behavior, no new modules beyond a single function.

`AcpSessionManager.session()` returns `AcpSession | RemoteAcpSession`, but `src/acp/manager.test.ts` calls `.run(...)` directly on that union in the ask/tell case, the non-fatal-error case, and the streaming case. `AcpSession` has no `run`, so the test file does not typecheck. `tsconfig.json` excludes `src/**/*.test.*`, and the type-aware lint block ignores test files, so nothing in the normal loop catches it; the tests only prove the session is remote when the runtime call happens to fail. An ad-hoc compile of the file (`npx tsc --noEmit --ignoreConfig ... src/acp/manager.test.ts`) reports the four `.run` errors and one unrelated stale `onReady()` call that omits its required `sandboxed` argument.

## Goal

Make the remote assumption explicit and type-safe at every `.run` call site in `src/acp/manager.test.ts`: a small helper takes the value returned by `acp.session(...)`, throws unless `'remote' in session`, and returns the narrowed `RemoteAcpSession`. The existing frame and event assertions stay exactly as they are, no production code changes, and the test file compiles cleanly when tests are typechecked.

## Approach

1. Import `RemoteAcpSession` as a type from `../remote/acp-session.js` (NodeNext `.js` extension).
2. Add `asRemoteSession(session: AcpSession | RemoteAcpSession): RemoteAcpSession` beside the other remote-test helpers in the `AcpManager — remote tabs` describe block. It narrows with `'remote' in session` — the same discriminant production uses in `src/acp/run-prompt.ts` and `src/agent/execute.ts` — and throws `Expected a remote ACP session.` otherwise.
3. Wrap the two `acp.session(...)` results in the separate-ids case, and the single results in the non-fatal-error and streaming cases, so `.run` is only ever called on the narrowed type.
4. Pass `true` to the stale `onReady()` call in the connection-label case. This is not part of the union defect, but it is the one remaining error in the file, and the goal is a test file that typechecks if the project ever includes tests; the argument is unused by the assertions.

## Implementation steps

1. Add the `RemoteAcpSession` type import and the `asRemoteSession` helper.
2. Rewrite the four `.run` call sites to go through the helper.
3. Give `onReady` its `sandboxed` argument.
4. Run `npx tsc --noEmit --ignoreConfig --target ES2023 --lib ES2024,DOM --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --types node src/acp/manager.test.ts` to confirm the file compiles, then `$janissary/scripts/run.mjs check-diff`.

## Tests

No new test cases. The three existing cases — separate ask/tell ids over one channel, a non-fatal error reaching the running run only, and chunks plus run end reaching the in-flight run — already exercise every helper call and keep their frame and event assertions unchanged. The compile check above is the new verification that the code is typed as it claims to be.

## Out of scope

- `AcpSessionManager.session()`'s return type or any production file.
- A broader test-typechecking setup (a `tsconfig` project for tests, a CI step, type-aware lint for test files); this plan only makes the file correct so such a step could be added later.
- Any behavior change to remote ACP sessions.

## Specs and docs

None. This change is test-only and alters no user-visible behavior, so `product/specs/acp.md`, `product/specs/remote-server.md`, `help/`, and `documentation/user-documentation/` are unaffected.
