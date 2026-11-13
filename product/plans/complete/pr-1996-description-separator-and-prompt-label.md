# Describe the trailing-separator refusal and the shortened follow-up prompt label in the PR #1996 description

**Complexity: 1/10** — description-only correction: 0 production lines and 0 production files, 4 requirements, 2 scenarios (p=3.12)

## Goal

PR #1996's description omits two behaviors the branch ships: `file write` and `file edit` refuse a path that ends in a path separator with `Is a directory: <path>.`, and the ACP tool loop's follow-up prompt names a mutation only by subcommand and path. Correct the description so a reviewer sees both.

## Approach

Verified against the code: `endsInSeparator` in `src/file-write/target.ts` is checked by `resolveMutationTarget` and by `applyMutation` in `src/file-write/tab-write.ts`, before any write or remote request; `describeLoopCommand` in `src/file-write/command.ts` is passed by `driveToolLoop` to `runAcpToolLoop` as `describeCommand`. `help/file.md` and `product/specs/acp.md` already document both. Edit only the PR body via `gh pr edit --body-file`, after the push.

## Implementation steps

1. In the "problem it solves" paragraph, add that a path ending in a separator, such as `notes/`, is refused as `Is a directory: <path>.` on local and remote tabs before anything is written or any remote request is sent.
2. In the ACP paragraph, add that the follow-up prompt names a mutation by subcommand and path only, so content and old and new strings are not sent back a second time, while history, transcripts and recordings keep the full command.
3. Add `file write {"path":"notes/","content":"x"}` printing `Is a directory: notes/.` to the Behavior examples refusal block.
4. Add an Edge cases step after "Directory target" expecting `Is a directory: notes/.` and no `notes` file or folder, renumbering later steps (including the step 30 reference in the closing paragraph).
5. Leave the title and every other paragraph unchanged.

## Tests

No code changes. `src/file-write/tab-write.test.ts`, `src/file-write/target.test.ts`, and `src/acp/drive-loop.test.ts` already pin both behaviors. Verify by comparing the applied body with the intended edit.

## Out of scope

Code, test, spec, and help changes; the second backlog entry (final `.` segment).
