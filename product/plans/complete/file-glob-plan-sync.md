# Bring the file glob plan back in line with the code after its repairs

**Complexity: 1/10** — 0 production lines or files (plan text only), 6 requirements, 0 test scenarios (p=2.95)

`product/plans/complete/file-glob.md` was written before the branch's repairs and still describes behavior the code no longer has. Seven repairs since then changed what the plan states: the pattern caps (`file-glob-pattern-limits.md`), the combined star budget (`file-glob-combined-star-budget.md`), the deadline on the git lookup (`file-glob-ignored-lookup-deadline.md`), pruning by real location under a linked `--path` (`file-glob-linked-path-ignored.md`), the one real-target check built per walk (`file-glob-secret-check-no-io.md`), cancellation through the prompt's signal (`file-glob-cancel-walk.md`), and the caller-side refusal (`file-glob-caller-runner-refusal.md`, which the plan already records).

## Goal

Every statement in the file glob plan's design decisions, proposed changes, tests, and out-of-scope list matches the code in `src/file-glob/`, `src/file-read/policy.ts`, `src/remote/filesystem/glob-paths-operation.ts`, `src/acp/run-prompt.ts`, and `src/remote/serve-acp-loop.ts`. Its `**Complexity: 7/10**` line stays unchanged, because it rates the original build.

## Approach

Edit only `product/plans/complete/file-glob.md`. Check each sentence against the code and the repair plans listed above. Rewrite only the sentences that are wrong or incomplete, and leave everything else as it is.

## Implementation steps

1. **Glob semantics decision.** Add `noext: true` to the option list and say extglob groups such as `+(a|b)` are matched literally, unlike `path.matchesGlob`. Replace the 64 KiB sentence with the caps from `src/file-glob/pattern-limits.ts`: at most 1024 characters (`FILE_GLOB_MAX_PATTERN_LENGTH`), at most 64 `{a,b}` alternatives (`FILE_GLOB_MAX_ALTERNATIVES`), and at most three `*` runs in one name (`FILE_GLOB_MAX_NAME_STARS`), or two once the pattern expands to more than two alternatives (`FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS`, `FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS`), with a `**` name not counted. Add the verbatim `FILE_GLOB_TOO_COMPLEX` refusal and say the matcher still matches nothing when minimatch itself rejects a pattern, as a fallback.
2. **Linked `--path` and hidden-and-ignored decisions.** Say the real location under a linked `--path` is also used to look entries up in the ignored set.
3. **Workspace outside git and Timeout decisions.** Say an ignored-set lookup cut off by the deadline is not treated as a git failure: the result is `(no matches)` followed by the timeout line, with no walk. Add a Cancellation decision: cancelling the ACP prompt kills a running git lookup and stops the walk at the next directory read; a typed glob, a remote tab's forwarded glob, and the far-side `glob-paths` operation pass no signal.
4. **Reuse table.** The glob matching row names `noext`, and the path policy row names `createRealTargetCheck`.
5. **Proposed changes.** Command module: `parseFileGlob` refuses a too-complex pattern after the limit check. Matcher section: add a `pattern-limits.ts` bullet, and say `createGlobMatcher` returns the match-nothing predicate for a too-complex pattern. `loadIgnoredPaths(root, deadline, signal?)`: a `timeout` set to the time remaining, `killSignal: 'SIGKILL'`, the signal passed to `execFile`, and an `undefined` result for a passed deadline, a killed child, or an aborted signal, while other failures still give an empty set. Walker: the `signal` option and the stop it causes, pruning by real location, and the `createRealTargetCheck(realRoot)` built once per walk for both the per-match secret check and the link-target check. Workspace and typed entries: the optional signal and the `undefined` lookup result. Remote protocol: `valid` refuses a too-complex pattern. ACP loop: `request.abort.signal` and `controller.signal` are passed through.
6. **Tests and Out of scope.** Add the tests the repairs added (`pattern-limits.test.ts`, `walk-secrets.test.ts`, the deadline, abort, and real-location cases, the too-complex parser and operation cases, the `createRealTargetCheck` policy test, and the run-prompt signal cases). Note that the 70 000-character pattern is now caught by the length cap. Add extglob support and cancelling a glob forwarded to a remote tab to Out of scope.

## Tests

None. This changes a plan document only, and the tests the repairs added already pin each behavior the plan now describes.

## Out of scope

- Any code, test, spec, help, or PR description change.
- The other entries in `product/backlog/pull-request.md` (PR description corrections).
- Changing the original plan's complexity rating.
