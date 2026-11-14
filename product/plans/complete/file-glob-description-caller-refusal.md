# Name the caller-side file glob refusal in the PR description

**Complexity: 1/10** — description-only: 0 production lines, 0 files, 3 requirements (p=2.56)

## Issue

PR #2001's description credits only `gateAgentCommand` with refusing an agent run's glob, while the branch also makes the caller-side runner `runGrantedAgentCommand` refuse every `file glob` line with `Agent: command not permitted: <command>.`, so that a glob a remote far side sends back as a caller command is refused rather than run in the caller tab.

## Approach

Change only the pull request description. Take the behavior from the code as it now stands: `runGrantedAgentCommand` in `src/agent/command-tools.ts` trims the line, drops a leading `/`, and returns `Agent: command not permitted: <command>.` before any grant check or dispatch when `isFileMutationCommandLine` or `isFileGlobCommandLine` matches. `isFileGlobCommandLine` in `src/file-glob/command.ts` matches `file glob` followed by whitespace or the end of the line, so `file globs x` is not a glob line and falls through to the grant check. Match the wording of the remote-run sentence in `product/specs/agent-command.md`.

## Implementation

1. Read the current PR body with `gh pr view --json body`.
2. In the decisions paragraph, after the sentence about `gateAgentCommand`, add a sentence saying that the caller-side runner `runGrantedAgentCommand` refuses the same glob lines with the same text, mirroring its mutation refusal, so a glob line that a remote host sends back as a caller command is refused too and never lists the caller's files, and that `file globs x` is not a glob line.
3. Leave every other paragraph byte-for-byte unchanged and apply the body with `gh pr edit --body-file ./temp/pr-body.md` after the push.

## Tests

None: no code, test, spec, or help changes. `src/agent/command-tools.test.ts` already pins the refusal, with and without the `file` grant, and the `file globs x` fall-through.

## Out of scope

- Changing either refusal, its text, specs, or help.
- Any other paragraph of the description.
