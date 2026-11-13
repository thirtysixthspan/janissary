# Make the outside-repository ignored-set test reach the git-failure fallback

**Complexity: 1/10** — no production code changes, 2 test requirements, 2 test scenarios (p=2.76)

The "returns an empty set outside any repository" case in `src/file-glob/ignored.test.ts` builds its root under `os.tmpdir()`. In a sandboxed workspace whose `TMPDIR` sits inside the parent repository's ignored `.janissary/` tree, git discovers that parent repository, succeeds, and answers the single `./` entry. The test then passes through the dropped-`.` branch of `loadIgnoredPaths`, and the `catch` that turns a git failure into an empty set goes untested. A regression that narrows the `catch` or lets a git exit escape would still pass.

## Goal

Both failure paths of `loadIgnoredPaths` are pinned on every host: a root that git cannot place in any repository, and a root that does not exist. Each resolves to an empty set and never rejects.

## Approach

Stub `GIT_CEILING_DIRECTORIES` to the real parent of the temporary root with `vi.stubEnv`, resolving it with `realpathSync` so a symlinked temp path such as macOS `/var` still matches. `loadIgnoredPaths` calls `execFile` without an `env` option, so the child git inherits the stubbed `process.env`, stops discovery at the root, and exits non-zero. Restore the environment with `vi.unstubAllEnvs()` in `afterEach`. Add a second case, following the precedent in `src/git/status.test.ts`, that passes a nonexistent subdirectory of the root. The test stays in the default `server` project rather than an `*.unsandboxed.test.ts` file, because that project is outside `npm test`.

## Implementation steps

1. In `src/file-glob/ignored.test.ts`, import `vi` from vitest and `realpathSync` from `node:fs`, and add `vi.unstubAllEnvs()` to `afterEach`.
2. In the "returns an empty set outside any repository" case, stub `GIT_CEILING_DIRECTORIES` to `path.dirname(realpathSync(root))` before calling `loadIgnoredPaths`.
3. Add a case that calls `loadIgnoredPaths` on `path.join(root, 'does-not-exist')` and expects it to resolve to an empty set.

## Tests

- A root that git cannot place in a repository, with discovery ceilinged at its parent, resolves to an empty set.
- A nonexistent root resolves to an empty set rather than rejecting.

Verify by temporarily replacing the `catch` body in `src/file-glob/ignored.ts` with a rethrow, confirming both cases fail, and restoring it.

## Out of scope

- Any change to `src/file-glob/ignored.ts`.
- The other five cases, which build their own nested repository.
- Specs and help pages, since no user-visible behavior changes.
