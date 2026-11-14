# State the deadline-cut git lookup outcome in the PR description

**Complexity: 1/10** — description-only: 0 production lines, 0 files, 4 requirements (p=2.71)

## Issue

PR #2001's description says that outside a git repository, or when git fails, nothing counts as ignored and only the fixed skip list applies. Since the ignored-lookup deadline repair, a git lookup cut off by the search's 30-second deadline instead ends the search with `(no matches)` and the timeout line `(search stopped after 30 seconds; narrow the pattern or --path)` without walking, and the description never says the 30 seconds include the git lookup. It also does not say that cancelling an ACP prompt stops a running agent glob and its git lookup, which the cancel-walk repair added for the same lookup.

## Approach

Change only the pull request description. Take the behavior from the code as it now stands: `loadIgnoredPaths` in `src/file-glob/ignored.ts` runs git with the time left before the deadline and the prompt's abort signal, returns `undefined` when git was killed, the signal aborted, or the deadline passed, and returns an empty set for any other failure. `globWorkspace` in `src/file-glob/glob.ts` turns `undefined` into an empty timed-out result, which formats as `(no matches)` plus the timeout line. `runCorePrompt` in `src/acp/run-prompt.ts` passes `request.abort.signal` to `globFilesInTab`, which hands it to `globWorkspace`, the git lookup, and the walk's per-folder abort check. Match the wording of `product/specs/acp.md` `### File glob`.

## Implementation

1. Read the current PR body with `gh pr view --json body`.
2. In the What section's timeout sentence, say the 30 seconds include asking git for the ignored set.
3. In the implementation paragraph, say the git call shares the 30-second deadline, limit "nothing counts as ignored" to a missing repository or any other git failure, state that a deadline-cut lookup ends the search with `(no matches)` and the timeout line rather than listing ignored paths, and state that cancelling an ACP prompt, or aborting a remote-hosted run, stops a running agent glob at its next folder read and stops its git lookup, while a typed glob has no cancellation.
4. Leave every other paragraph byte-for-byte unchanged and apply the body with `gh pr edit --body-file ./temp/pr-body.md` after the push.

## Tests

None: no code, test, spec, or help changes. `src/file-glob/ignored.test.ts`, `src/file-glob/glob.test.ts`, and the walk and run-prompt cancellation tests already pin the deadline outcome and the cancellation.

## Out of scope

- Changing the deadline, the fallback, the cancellation, specs, or help.
- The caller-side runner refusal correction still recorded in `product/backlog/pull-request.md`.
