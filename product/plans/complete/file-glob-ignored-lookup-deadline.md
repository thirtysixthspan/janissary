# Bound the file glob's git ignored-set lookup by the search deadline

**Complexity: 3/10** — ~12 added lines, 2 files, 4 requirements, 5 test scenarios (p=4.40)

`loadIgnoredPaths` in `src/file-glob/ignored.ts` runs `git ls-files --others --ignored --exclude-standard --directory -z` with no timeout and without the glob's deadline. A slow git call can run far past the promised 30 seconds before the walk starts, and on a remote tab a call past the 60-second request deadline replaces the documented timeout line with a request failure.

## Goal

The whole `file glob` search, including the ignored-set lookup, stops at its 30-second deadline. When the lookup is cut off by the deadline, the result is `(no matches)` followed by `(search stopped after 30 seconds; narrow the pattern or --path)`, and git-ignored paths are never listed unpruned because of a cut-off lookup.

## Approach

Pass the deadline into the lookup and give `execFile` a `timeout` of the time remaining with `killSignal: 'SIGKILL'`. The reviewer's proposal relied on the walk noticing the passed deadline after the lookup returns an empty set; that ordering is fragile (a timer can fire a millisecond before `Date.now()` reaches the deadline, letting the walk run with an empty ignored set). Instead the lookup reports a cut-off explicitly: it resolves `undefined` when the deadline has already passed before spawning git, or when git fails and the deadline has passed. `globWorkspace` turns `undefined` into an immediate timed-out result with no matches, never walking with an empty set. Every other git failure keeps resolving an empty set, as today.

## Implementation steps

1. `src/file-glob/ignored.ts`: change the signature to `loadIgnoredPaths(root: string, deadline: number): Promise<ReadonlySet<string> | undefined>`. Return `undefined` without spawning when `deadline - Date.now()` is not positive. Pass `timeout: remaining` and `killSignal: 'SIGKILL'` to `execFile`. In the catch, return `undefined` when `Date.now() >= deadline` or the error reports the child was killed, otherwise an empty set.
2. `src/file-glob/glob.ts`: pass `deadline` to `loadIgnoredPaths`; when it resolves `undefined`, return `formatGlobResult([], { limit, truncated: false, timedOut: true })` without walking. `--hidden` keeps skipping the lookup.

## Tests

- `src/file-glob/ignored.test.ts`: a deadline already passed resolves `undefined` without running git (fast, inside an ignoring repository); a `git` on `PATH` that hangs (a stub script `exec sleep 5`) is killed at a short deadline and resolves `undefined` well before the stub would exit. Existing tests pass a far deadline.
- `src/file-glob/glob.test.ts` (git-ignored block): with the hanging `git` stub and a short deadline, a glob in a repository with ignored `dist/` prints `(no matches)` and the timeout line rather than an unpruned listing; with `--hidden` the stub is not consulted and the walk lists everything.

## Spec

`product/specs/acp.md` file glob paragraph: state that the 30 seconds include looking up git-ignored paths, and a lookup that uses them up prints `(no matches)` and the timeout line.

## Out of scope

- The other `product/backlog/pull-request.md` entries (per-match secret I/O, caller-side refusal, linked `--path` ignored lookup).
- Making the walk itself asynchronous or changing the 30-second budget.
