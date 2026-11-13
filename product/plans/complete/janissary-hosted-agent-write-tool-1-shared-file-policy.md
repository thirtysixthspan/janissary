# Hosted write tool 1 — extract the shared file-read policy

**Complexity: 5/10** — ~85 moved/added lines in one new policy module, 1 edited file, 6 requirements, 14 scenarios (p=5.26).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 1 of 15 in the hosted write tool series. Depends on no earlier subplan.

The hosted write and edit tools must refuse exactly what `file read` refuses: absolute and escaping paths, symlinks that leave the root, `.env` files, `SECRET_DENY_PATHS` locations in the workspace, and those same locations under the real home directory. Today that policy lives in private helpers inside `src/file-read/read.ts`. This plan moves it into `src/file-read/policy.ts` so the target resolver, writer, and editor in plans 4 through 6 can call the same code, and changes no read behavior.

## Goal

One exported definition of the workspace path, secret, regular-file, and size policy, consumed by the reader now and by the tool writer and editor later (plans 4 through 6). Every existing `file read` result, local and remote, stays byte-for-byte the same.

## Design decisions and dependencies

- Source plan decision: extract shared policy only where both readers and writers need it, and preserve existing file-read imports and behavior. `readWorkspaceLines`, `readWorkspaceCommand`, and `FILE_READ_MAX_BYTES` keep their current exports from `src/file-read/read.ts`, so none of its importers change: `src/agent/execute.ts` and `src/remote/serve-acp-loop.ts` (`readWorkspaceCommand`), `src/file-read/tab-read.ts` and `src/remote/filesystem/read-lines-operation.ts` (`readWorkspaceLines`), and the tests `src/file-read/read.test.ts`, `src/acp/run-prompt.test.ts`, and `src/remote/serve-file-navigator.test.ts`.
- The 5 MiB limit is defined once, in `policy.ts`, as `FILE_POLICY_MAX_BYTES`. `read.ts` keeps `export const FILE_READ_MAX_BYTES` by assigning it from the imported `FILE_POLICY_MAX_BYTES`. Do not use `export { … } from` or `export *`: the `no-restricted-syntax` rule in `eslint.config.mjs` (selectors `ExportNamedDeclaration[source]` and `ExportAllDeclaration`) forbids re-exports in every `src/` module except `src/protocol.ts`, `src/plugins/api.ts`, and `src/plugins/fixture-v1/activate.ts`.
- The failure vocabulary type, today the private `ReadFailure` in `read.ts` (`'File not found' | 'Is a directory' | 'Not a text file' | 'File too large (>5 MB)' | 'Outside the workspace' | 'Secret file'`), moves to `policy.ts` and is exported as `FilePolicyFailure` with the same six members and spelling, so the writer returns the same words. `read.ts` uses the imported type; it keeps no alias of its own.
- Split the current `loadBytes` so the physical checks are reusable without reading content:
  - `checkRealTarget(realRoot, realTarget)` takes paths the caller already passed through `realpathSync` and returns `'Outside the workspace'` when the target is not inside the root (via `containedAbsolute`), `'Secret file'` when the root-relative path matches the secret matcher or the target is under a home secret, and `undefined` otherwise — the same three checks, in the same order, as the first lines of `loadBytes` today. It does no I/O of its own beyond what `isUnderHomeSecret` already does (resolving the home directory and table entries).
  - `classifyStats(stats)` takes an `fs.Stats` the caller obtained and returns `'Is a directory'`, `'Not a text file'` (any non-regular file), `'File too large (>5 MB)'` (size over `FILE_POLICY_MAX_BYTES`), or `undefined`, in that order. Taking a `Stats` rather than a path keeps it free of I/O and lets plan 4 classify with either `stat` or `lstat` without opening the file.
  - The `try`/`catch` that turns any `realpathSync`, `statSync`, or `readFileSync` throw into `'File not found'` stays in `read.ts`, because that mapping is reader behavior; plans 4 through 6 map filesystem errors through `fileOperationReason` instead.
- `checkLexical` moves unchanged and is exported as `checkLexicalPath(root, requested)`, returning `FilePolicyFailure | undefined`.
- `isSecretPath`, `containsRun`, `SECRET_SEGMENT_RUNS`, `resolveExisting`, and `isUnderHomeSecret` move to `policy.ts` unchanged and stay module-private: the three exported checks are the only entry points plans 4 through 6 need, and unused exports would be flagged by `knip` in `npm run check`.
- `decodeText` stays private in `read.ts`. It uses a default `TextDecoder`, which strips a leading BOM; plans 6 and 7 deliberately decode with `ignoreBOM: true` instead, and plan 5 validates supplied text rather than decoding bytes, so no writer shares this decoder and the source plan's "extract only where both need it" rule keeps it with the reader.
- Imports in both files are direct and carry `.js` extensions (`../path-containment.js`, `../sandbox/paths.js`, `./policy.js`).
- No dependency on any later subplan. Plans 4, 5, and 6 depend on the three exported checks, the failure type, and the limit by the names chosen here.

## What already exists (reuse, don't rebuild)

| Existing code | Behavior to keep |
| --- | --- |
| `src/file-read/read.ts` `isSecretPath`, `containsRun`, `SECRET_SEGMENT_RUNS` | Case-insensitive `.env`/`.env.*` final-segment and `SECRET_DENY_PATHS` segment-run matching relative to the root |
| `src/file-read/read.ts` `resolveExisting`, `isUnderHomeSecret` | Real-home anchoring of secret locations, literal and resolved, through the nearest existing prefix |
| `src/file-read/read.ts` `checkLexical` | Absolute path, lexical escape, root-relative secret, and home-secret refusal before touching the target |
| `src/file-read/read.ts` `loadBytes` | Physical containment through `realpathSync`, secret recheck on the real path, directory / non-regular / size refusal, `File not found` for any thrown failure |
| `src/file-read/read.ts` `decodeText` | Fatal UTF-8 decoding with NUL refusal; stays in `read.ts` |
| `src/path-containment.ts` `containedAbsolute` | Containment predicate |
| `src/sandbox/paths.ts` `SECRET_DENY_PATHS` | The secret table |

## Proposed changes

Create `src/file-read/policy.ts` holding `FILE_POLICY_MAX_BYTES`, the `FilePolicyFailure` type, the private secret matcher, existing-prefix resolver, and home-secret check, and the exported `checkLexicalPath`, `checkRealTarget`, and `classifyStats`. Move the comment above `isUnderHomeSecret` ("The reader runs outside the sandbox on an agent's behalf, so it must deny what the Seatbelt rule … denies") with it, reworded so it covers both the reader and the tool writer acting on an agent's behalf. The module is roughly 70 counted lines, well under the 200-line limit.

Reduce `src/file-read/read.ts` to the composition. `readWorkspaceLines` keeps its current order and messages: `checkLexicalPath`; then a private loader that, inside the existing `try`/`catch`, resolves the real root and real file, applies `checkRealTarget`, stats the real file, applies `classifyStats`, and reads the bytes; then `decodeText`; then `formatFileLines`. `readWorkspaceCommand` is unchanged.

## Tests

- Add `src/file-read/policy.test.ts` against temporary directories (`mkdtempSync` under `tmpdir()`, as `src/file-read/read.test.ts` does), covering the three exported checks directly:
  - `checkLexicalPath`: an absolute path and a `../` escape are `Outside the workspace`; `.env` and `nested/.env.local` (and an upper-case `.ENV`) are `Secret file`; a `SECRET_DENY_PATHS` run such as `.ssh/id_rsa` inside the root is `Secret file`; an ordinary relative path is `undefined`.
  - `checkRealTarget`: a real target outside the real root is `Outside the workspace`; a real target that is a secret relative to the real root is `Secret file`; with a root under the home directory (stub `HOME` with `vi.stubEnv` and restore with `vi.unstubAllEnvs`, as the "secrets under the home directory" block in `read.test.ts` does), a target under `~/.ssh` is `Secret file`; an ordinary contained file is `undefined`.
  - `classifyStats`: a directory is `Is a directory`; a named pipe made with `mkfifo` (as `src/notifications/record.test.ts` does) is `Not a text file` using only `statSync`, never opened; a file of exactly `FILE_POLICY_MAX_BYTES` (use `truncateSync`) is `undefined` and one byte over is `File too large (>5 MB)`.
- Invalid UTF-8 and NUL refusal stay covered by the existing `read.test.ts` cases (`bad.bin`, `nul.bin`), because `decodeText` does not move.
- Keep `src/file-read/read.test.ts`, `src/file-read/tab-read.test.ts`, `src/commands/file.test.ts`, `src/acp/run-prompt.test.ts`, and the remote read-lines coverage in `src/remote/serve-file-navigator.test.ts`, `src/remote/filesystem/operations.test.ts`, and `src/file-navigator/remote/port.test.ts` unchanged and green; they are the regression proof that read behavior did not move. Do not edit an existing assertion to make it pass.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm `git diff` touches only `src/file-read/read.ts`, `src/file-read/policy.ts`, and `src/file-read/policy.test.ts`, and that no spec or help text changes, because no behavior changes. Manual check: in a local tab, `file read` an ordinary file, a `.env`, a directory, and `../outside`, and confirm the output matches what the same commands print on `master`.

## Out of scope

- Any write or edit behavior, which starts in plans 4 through 6.
- Changing any read message, limit, decoder, or secret rule.
- A BOM-preserving or shared text decoder (plans 6 and 7 own their own).
- Moving other file commands or consolidating the file-read directory.
