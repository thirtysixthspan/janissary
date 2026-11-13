# Hosted write tool 1 — extract the shared file-read policy

**Complexity: 4/10** — ~85 moved/added lines in one new policy module, 1 edited file, 4 requirements, 11 scenarios (p=4.95).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 1 of 15 in the hosted write tool series. Depends on no earlier subplan.

The hosted write and edit tools must refuse exactly what `file read` refuses: absolute and escaping paths, symlinks that leave the root, `.env` files, `SECRET_DENY_PATHS` locations in the workspace, and those same locations under the real home directory. Today that policy lives in private helpers inside `src/file-read/read.ts`. This plan moves it into `src/file-read/policy.ts` so the target resolver, writer, and editor in plans 4 through 6 can call the same code, and changes no read behavior.

## Goal

One exported definition of the workspace path, secret, regular-file, size, and UTF-8 text policy, consumed by the reader now and by the tool writer later. Every existing `file read` result, local and remote, stays byte-for-byte the same.

## Design decisions and dependencies

- Source plan decision: extract shared policy only where both readers and writers need it, and preserve existing file-read imports and behavior. `readWorkspaceLines`, `readWorkspaceCommand`, and `FILE_READ_MAX_BYTES` keep their current exports from `src/file-read/read.ts` so `src/agent/execute.ts`, `src/file-read/tab-read.ts`, `src/remote/filesystem/read-lines-operation.ts`, `src/remote/serve-acp-loop.ts`, and the tests do not move.
- The 5 MiB limit is defined once. Move its value into `policy.ts` as the policy's limit and have `read.ts` keep exporting `FILE_READ_MAX_BYTES` by importing it from there under that name (a plain re-declaration from the imported constant, not an `export … from`, which `eslint.config.mjs` forbids outside the three allowed modules).
- The failure vocabulary type (`'File not found' | 'Is a directory' | 'Not a text file' | 'File too large (>5 MB)' | 'Outside the workspace' | 'Secret file'`) moves with the helpers so the writer can return the same words.
- Split the current `loadBytes` so the physical checks are reusable without reading content: one helper answers containment and secret refusal for an already resolved real root and real target; a second classifies the target's `stat` as directory, non-regular file, or oversized before any content read. The reader composes them exactly as it does today.
- No dependency on any later subplan.

## What already exists (reuse, don't rebuild)

| Existing code | Behavior to keep |
| --- | --- |
| `src/file-read/read.ts` `isSecretPath`, `containsRun`, `SECRET_SEGMENT_RUNS` | Case-insensitive `.env`/`.env.*` and `SECRET_DENY_PATHS` segment-run matching relative to the root |
| `src/file-read/read.ts` `resolveExisting`, `isUnderHomeSecret` | Real-home anchoring of secret locations, literal and resolved |
| `src/file-read/read.ts` `checkLexical` | Absolute path, lexical escape, and secret refusal before touching the disk |
| `src/file-read/read.ts` `loadBytes` | Physical containment through `realpathSync`, secret recheck on the real path, directory / non-regular / size refusal, `File not found` for any other failure |
| `src/file-read/read.ts` `decodeText` | Fatal UTF-8 decoding with NUL refusal |
| `src/path-containment.ts` `containedAbsolute` | Containment predicate |
| `src/sandbox/paths.ts` `SECRET_DENY_PATHS` | The secret table |

## Proposed changes

Create `src/file-read/policy.ts` holding the secret-path matcher, the existing-prefix resolver, the home-secret check, the lexical check (exported as the policy's lexical entry point), the physical containment-and-secret check for a real root and real target, the stat classifier, the fatal UTF-8 decoder, the failure vocabulary type, and the 5 MiB limit. Keep the comment explaining why the reader denies what the Seatbelt rule denies; it now explains the policy for both consumers.

Reduce `src/file-read/read.ts` to the composition: lexical check, physical load built from the extracted helpers, decode, then `formatFileLines`. It keeps `readWorkspaceLines`, `readWorkspaceCommand`, and `FILE_READ_MAX_BYTES` as exports. Use direct imports with `.js` extensions.

## Tests

- Add `src/file-read/policy.test.ts` covering the exported helpers directly: absolute and escaping paths, `.env` and `.env.local` at any depth, a `SECRET_DENY_PATHS` run inside the workspace, a secret under the real home directory reached through the workspace, a symlink alias to a secret, a directory, a named pipe classified without being opened, the exact 5 MiB boundary and one byte over, invalid UTF-8, and NUL-containing text.
- Keep `src/file-read/read.test.ts`, `src/file-read/tab-read.test.ts`, `src/commands/file.test.ts`, and the remote `read-lines` tests unchanged and green; they are the regression proof that read behavior did not move.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm no spec or help text changes, because no behavior changes.

## Out of scope

- Any write or edit behavior, which starts in plans 4 through 6.
- Changing any read message, limit, or secret rule.
- Moving other file commands or consolidating the file-read directory.
