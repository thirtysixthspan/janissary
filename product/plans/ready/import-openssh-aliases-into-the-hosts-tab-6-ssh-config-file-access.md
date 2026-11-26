# Read and write the ssh config target safely
**Complexity: 4/10** — ~100 production lines, 10 requirements, 10 test scenarios, 2 new exports and no existing files edited (p=5.18)

## Goal

Add the bounded read and symlink-safe atomic write for the ssh config target, with the exact problem words both operations report. It is the sixth piece of `import-openssh-aliases-into-the-hosts-tab.md`. Subplans 7 and 8 use it for their source and target files; the create-mode parameter it needs arrives in `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md`.

## Requirements

1. A read is bounded at 1 MiB and a larger file reports `file is too large` ("Cannot read / Nothing to", Design decisions).
2. A missing source file reports `no such file` ("Cannot read / Nothing to").
3. A source path that is a directory reports `is a directory` ("Cannot read / Nothing to").
4. A source path that cannot be opened for permission reasons reports `permission denied` ("Cannot read / Nothing to").
5. Any other read error reports `could not be read` (source plan Implementation step 4).
6. A write to an existing symlinked target follows the link and replaces the file it points at, leaving the link in place ("Resolve link, then atomic").
7. A missing parent directory is created recursively with mode `0700` ("Create it").
8. A missing target file is created with mode `0600` ("Create it").
9. The target is replaced atomically ("Resolve link, then atomic").
10. A write maps `ENOENT`, `EISDIR`, and `EACCES` to `no such file`, `is a directory`, and `permission denied`, and any other write error to `could not be read` (source plan Implementation step 4).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md` for the create-mode parameter on `replaceFileAtomically`. `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md` and `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` consume this module, so they land later.

- The new module is `src/plugins/hosts/ssh-config-file.ts`, beside `ssh-config-file.test.ts`. It owns effects only; path resolution stays in `import-openssh-aliases-into-the-hosts-tab-5-path-resolution.md`. This preserves the project's parse/execute seam (`src/plugins/hosts/catalog-commands.ts:52` `export function parseCatalogCommand(argument: string): CatalogParse {` parses before any I/O).
- Export exactly two functions, named `readSshConfigFile` and `writeSshConfigFile`, following the `readJsonConfigFile` / `writeJsonConfigFile` pair at `src/plugins/files.ts:105` and `:88`. Both return a result carrying an optional problem word rather than throwing; the read result also carries the file text, empty when nothing could be read. A missing file carries empty text and the word `no such file`, so import can refuse it while export treats it as a new file, as `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md` and `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` both require.
- Reading checks the byte size with `statSync` before decoding and maps `ENOENT`, `EISDIR`, `EACCES`, and the oversize case to the exact words in Requirements 1 to 4. Every other error becomes `could not be read`. The ceiling applies only to the read, so `file is too large` never appears in a write result.
- Writing creates a missing parent with `mkdirSync` recursive mode `0700` before resolving it, because `realpathSync` on a directory that does not yet exist throws. It then resolves the parent through `realpathSync`, and follows a symlinked leaf with `lstatSync` followed by `realpathSync`, the same order as `src/file-navigator/filesystem-port.ts:212` `realpathSync(path.dirname(absolute))` through `:214` `lstatSync(target).isSymbolicLink()` and `realpathSync(target)`. The replacement goes through `replaceFileAtomically` with create mode `0600`, so the link survives and an existing file keeps its own mode (Assumption 3).
- The module imports `replaceFileAtomically` from `../files.js`, which is on the allowlist, and nothing else through `../`. Both new files stay well under the 200-line `max-lines` limit (`eslint.config.mjs:62`), so no extraction is needed. Tests use `mkdtempSync` scratch directories removed in `afterEach` as in `src/plugins/hosts/catalog-commands.test.ts:26`, and force `EACCES` and other errors with `vi.mock('node:fs', ...)` as `src/atomic-write.test.ts:8` forces a rename failure, rather than relying on `chmodSync` that a privileged test runner could ignore.

## Preserved behavior

1. An atomic replace keeps an existing file's mode. Passing `0600` for a newly created target must not chmod, reopen, or otherwise change the mode of a target that already exists. Pinned by `src/atomic-write.test.ts` › `preserves an existing file mode`; subplan `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md` adds the create-mode parameter and keeps that test green.

## Assumptions

1. A concrete server plugin may reach `../files.js` but not other host internals: the allowlist at `eslint.plugin-boundaries.mjs:36` includes `api\.js|files\.js` among the permitted `../` targets.
2. Symlink-preserving atomic replacement already exists for workspace writes: `src/file-navigator/filesystem-port.ts:212` `let target = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));` and `:214` `if (lstatSync(target).isSymbolicLink()) target = realpathSync(target);`.
3. The create-mode pass-through on `replaceFileAtomically` is delivered by `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md`: `src/plugins/files.ts:92` `export function replaceFileAtomically(`.

## Existing functionality

1. Plugin-facing atomic replacement with an optional create mode: `src/plugins/files.ts:92` `export function replaceFileAtomically(`.
2. Symlink-following before an atomic write: `src/file-navigator/filesystem-port.ts:212` `let target = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));`.
3. The scratch-directory test pattern: `src/plugins/hosts/catalog-commands.test.ts:26` `function directories(): { home: string; root: string } {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes two new files. The module `src/plugins/files.ts` already exists, but its optional create-mode parameter does not: `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md` must be implemented before step 1 or the third argument to `replaceFileAtomically` will not typecheck. Nothing here depends on subplans 7 and 8, which consume these exports later.

1. Add `src/plugins/hosts/ssh-config-file.ts`. Export `readSshConfigFile` implementing Requirements 1 to 5 and `writeSshConfigFile` implementing Requirements 6 to 10, with the result contract from Design decisions. Import only `../files.js` through `../` plus Node built-ins. Build with `$janissary/scripts/run.mjs check-diff`.
2. Add `src/plugins/hosts/ssh-config-file.test.ts` using temporary directories and mocked `node:fs` errors, covering Requirements 1 to 10 as listed under Tests. Build with `$janissary/scripts/run.mjs check-diff` and confirm the whole server test project still passes.

## UI design

1. No user interface surface changes. These are server-side file helpers with no client entry point.

## Tests

In `src/plugins/hosts/ssh-config-file.test.ts`, with `mkdtempSync` scratch directories removed in `afterEach` and error codes forced through `vi.mock('node:fs', ...)` (Design decisions):

- A file of `1024 * 1024 + 1` bytes, a missing file, a directory, an `EACCES` failure, and a forced other error each return the exact words from Requirements 1 to 5; a missing file still returns empty text alongside `no such file` (Requirements 1 to 5).
- A new file has mode `0600` and a missing parent has mode `0700`; an existing symlink still points at the same target after a write and the target's bytes changed (Requirements 6 to 8). Atomic replacement itself is inherited from `replaceFileAtomically` and pinned by `src/atomic-write.test.ts` › `preserves an existing file and removes the temporary file when the final rename fails`, so this file needs no separate atomicity test (Requirement 9).
- A forced write error returns the mapped problem word and leaves the original bytes in place (Requirement 10).

## Out of scope

- No path resolution, no operand grammar, no alias parsing, and no section splicing.
- No catalog access, no import or export operation, and no notification wording around the problem words.
- No change to `src/atomic-write.ts`, `src/plugins/files.ts`, or the boundary allowlist.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config-file.test.ts` and read the symlink case. Confirm the link itself still exists after the write, that its target reports mode `0600` when newly created, and that a scratch file just over 1 MiB reports `file is too large`. A failure looks like a replaced symlink, a mode left at the process umask, or the wrong problem word. There is no running-app end-to-end check at this subplan because neither a command nor a button reads these helpers yet; that check belongs to `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md`, as it does for `import-openssh-aliases-into-the-hosts-tab-5-path-resolution.md`.
