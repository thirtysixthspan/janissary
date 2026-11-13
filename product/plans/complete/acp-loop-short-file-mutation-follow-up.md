# Short file mutation labels in the ACP tool loop follow-up prompt
**Complexity: 3/10** — ~20 added lines across 4 files (types, loop, drive-loop, file-write command), 3 requirements, 6 test scenarios (p=4.64)

## Goal

Stop the ACP tool loop from echoing a whole `file write` or `file edit` command, with its content or old and new strings of up to 5 MB, back to the agent in the follow-up prompt. The follow-up's "Output of" line names a file mutation as `file write <path>` or `file edit <path>` instead, so a large write does not double its size in the agent's context.

## Approach

- `runAcpToolLoop` in `src/acp/loop.ts` stays generic. `AcpLoopDeps` in `src/acp/types.ts` gains an optional `describeCommand(command)` that returns the label for the follow-up's "Output of" line; when absent, the loop uses the raw command as today.
- `driveToolLoop` in `src/acp/drive-loop.ts` passes `describeCommand: describeLoopCommand`, a new exported function in `src/file-write/command.ts`. For a line that `isFileMutationCommandLine` accepts it returns `file write <path>` or `file edit <path>` using `parseFileMutation` and `displayPath` (so control characters in the path stay escaped), and the bare `file write` or `file edit` when the JSON does not parse or is refused by the parser. Every other command is returned unchanged.
- Transcript entries, connection records and `h.ranCommand` keep the full command text, as the canonical plan `janissary-hosted-agent-write-tool.md` requires recordings to keep mutation payloads. Only the follow-up prompt text changes.

## Implementation steps

1. Add `describeCommand?: (command: string) => string` to `AcpLoopDeps` and use it for the follow-up's "Output of" label in `src/acp/loop.ts`.
2. Add `describeLoopCommand` to `src/file-write/command.ts` and pass it from `driveToolLoop`.

## Tests

- `src/acp/loop.test.ts`: a supplied `describeCommand` labels the follow-up while `ranCommand` still receives the full command.
- `src/acp/drive-loop.test.ts`: a granted `file write` step's follow-up contains `Output of \`file write notes.md\`:` and the result line, but not the content; `ranCommand` still records the full command; a `file read` step still echoes its command verbatim.
- `src/file-write/command.test.ts` (or a sibling test): `describeLoopCommand` labels a write and an edit by path, falls back to the bare subcommand for malformed JSON, escapes control characters in the path, and returns other commands unchanged.

## Spec

`product/specs/acp.md`, Typed file writes and edits: the follow-up prompt after a file mutation names the command and path only, while history and transcripts keep the full command.

## Out of scope

- Redacting mutation payloads from history, transcripts or ACP recordings.
- Changing the follow-up text for any non-mutation command.
- Remote ACP sessions, which run their own loop on the remote side through the same `driveToolLoop`.
