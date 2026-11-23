# Add a generic file reaper that deletes old files of one extension from a directory

**Complexity: 4/10** — 11 requirements, 12 test scenarios, one new ~35-line module and no edited files (p=5.08)

## Goal

Harness transcripts are to be kept for a configurable number of days and swept at launch by "a log reaper process that runs in the background on launch". This subplan delivers the sweep itself as a generic, harness-agnostic module, `src/state/reaper.ts`, that deletes files of one extension, directly inside one directory, whose last-modified time is before a cutoff. It is asynchronous so it never blocks the event loop, and it never fails. Nothing calls it yet; `product/plans/ready/harness-transcripts-4-retention-sweep.md` wires it to the harness transcript directory at launch.

Source plan: `product/plans/complete/harness-transcripts.md` (implementation step 2). Run order: 2 of 5. Depends on no earlier subplan, and touches no file that subplan 1 (`product/plans/ready/harness-transcripts-1-log-config-settings.md`) touches, so it can land before or after it.

## Requirements

1. The reaper deletes a file whose name ends with the given extension and whose mtime is strictly before the cutoff (source Requirement 17; user answer: "Last modified").
2. The reaper never deletes a file whose mtime is at or after the cutoff (source Requirement 20).
3. The reaper considers only entries directly inside the given directory and never descends into a subdirectory (source Requirement 21; user answer: "Old .txt files").
4. The reaper never removes a subdirectory, whatever its name or age (source Requirement 22; user answer: "Subfolders and other files are never touched").
5. The reaper never removes a file whose name does not end with the given extension, whatever its age (source Requirement 22).
6. The reaper deletes only regular files; a symbolic link is skipped (source Requirement 21: "only regular `*.txt` files").
7. A missing directory makes the reaper a no-op that resolves (source Requirement 23).
8. An unreadable directory makes the reaper a no-op that resolves (source Requirement 23).
9. A file whose stat fails is skipped silently, and the reaper continues with the rest (source Requirement 24; user answer: "A failed stat or delete skips that file silently").
10. A file whose delete fails is skipped silently, and the reaper continues with the rest (source Requirement 24).
11. The reaper's promise never rejects (source Requirement 19, which depends on the caller being able to fire and forget it).

## Design decisions

- Put the sweep in a generic module, `src/state/reaper.ts`, that takes a directory, an extension, and a cutoff in epoch milliseconds (user answer: "Generic reaper module").
- Export one async function, `reapFilesOlderThan(directory, extension, cutoffMs)`, typed `(string, string, number) => Promise<void>`. The module exports nothing else. Subplan 4 imports exactly this name.
- Use `node:fs/promises` (`readdir` with `withFileTypes: true`, `stat`, `unlink`) and `node:path` (`path.join(directory, entry.name)` for each entry's path), so the sweep yields to the event loop instead of blocking startup (source Requirement 19; Existing functionality 1). The module imports nothing else.
- Treat a failed `readdir` (missing directory, unreadable directory, or a path that is not a directory) as "nothing to do": catch it and return, the way `readSorted` returns an empty list (Existing functionality 2). The function does no argument validation of its own; an empty-string directory falls into this case because `readdir('')` rejects with `ENOENT`.
- Decide "regular file" from the directory entry (`isFile()` on the `Dirent`, as `classify` does in Existing functionality 3), so subdirectories, symbolic links, sockets, and other entry types are never candidates and are never stat'd.
- Match the extension with a case-sensitive `name.endsWith(extension)` on the entry name. `old.TXT` and `old.txt.bak` do not match `.txt`.
- Stat a candidate with `stat` (not `lstat`); the `Dirent` check has already excluded symbolic links. Assign the awaited stat result to a local before reading `mtimeMs` (Assumption 5).
- Delete strictly before the cutoff (`mtimeMs < cutoffMs`), never at it. The caller relies on this to keep files created at or after launch (source design decision on the cutoff).
- Process entries one at a time, awaiting each, in the order `readdir` returns them. The stat and unlink for one entry share one `try`/`catch`, so one failure cannot stop the rest and the function body cannot throw.
- Failures are silent: the reaper writes nothing to stderr, the activity log, or a notification. Each catch block that ignores a failure holds a one-line comment saying why, the way `src/bus.ts:117` does (Assumption 4).
- Add a header comment above the export stating the contract: direct entries only, regular files only, case-sensitive suffix match, strict mtime cutoff, failures skipped silently, never rejects.
- The reaper imports nothing from `src/harness/`, so the later `src/harness/transcript-file.ts` → `src/state/reaper.ts` import (subplan 4) cannot form a cycle with the existing `src/state/dirs.ts` → `src/harness/transcript-file.ts` import (Assumption 1).

## Preserved behavior

None found

## Assumptions

1. `src/state/dirs.ts` already imports the harness transcript module, so a reaper in `src/state/` that imported from `src/harness/` would form a cycle: `src/state/dirs.ts:3` `import { initHarnessTranscriptDirectory, clearHarnessTranscriptDirectory } from '../harness/transcript-file.js';`.
2. Tests in this codebase age files on disk with `utimesSync`: `src/file-stat/tab-stat.test.ts:30` `utimesSync(target, STAMP, STAMP);`.
3. Tests in this codebase make a directory unreadable with `chmodSync(..., 0o000)` and restore its mode in `finally`: `src/file-glob/walk.test.ts:146` `chmodSync(locked, 0o000);`.
4. An empty block, including an empty `catch`, fails lint through ESLint's recommended `no-empty` rule unless it holds a comment: `eslint.config.mjs:15` `js.configs.recommended,`.
5. Reading a member directly off an awaited expression fails lint: `eslint.config.mjs:42` `'unicorn/no-await-expression-member': 'error',`.
6. Passing a non-literal path to an fs function is allowed in `src/`, so `readdir(directory)` needs no lint suppression: `eslint.config.mjs:111` `'security/detect-non-literal-fs-filename': 'off',`.
7. Relative imports under `src/` must carry `.js`, so the test imports the module as `./reaper.js`: `eslint.config.mjs:130` `'import-x/extensions': ['error', 'ignorePackages', { ts: 'never', tsx: 'never', js: 'always', json: 'always' }],`.
8. Test files are exempt from `max-lines`, and the reaper module itself stays far under the 200-line limit: `eslint.config.mjs:117` `rules: { 'max-lines': 'off' },`.
9. A new `src/**/*.test.ts` file runs in the `server` vitest project, which sets no automatic mock reset, so a mock implementation installed in one test persists into the next unless it is consumed or cleared: `vitest.config.ts:14` `include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],`.

## Existing functionality

1. Async directory listing with `node:fs/promises`: `src/file-glob/walk.ts:1` `import { readdir, realpath, stat } from 'node:fs/promises';`.
2. A directory read that returns nothing instead of throwing when the directory is missing or unreadable: `src/file-glob/walk.ts:45` `async function readSorted(dir: string): Promise<Dirent[]> {`.
3. Classifying a directory entry as a regular file from its `Dirent` without a stat: `src/file-glob/walk.ts:67` `if (entry.isFile()) return 'file';`.
4. A comment-holding catch that deliberately ignores a failure: `src/bus.ts:117` `// A throwing sink must not break the emit path it was added to protect.`.
5. A test-file partial mock of `node:fs/promises` that passes every function through to the real module: `src/file-glob/walk.test.ts:9` `vi.mock('node:fs/promises', async (importOriginal) => {`.
6. Making a passed-through fs mock misbehave for a single call: `src/file-glob/walk.test.ts:126` `vi.mocked(readdir).mockImplementationOnce(`.
7. Skipping a permission test when running as root, where `chmod 0o000` does not block reads: `src/file-glob/walk.test.ts:141` `it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(`.

## Implementation steps

1. **Reaper module and its tests.** Add `src/state/reaper.ts` exporting `reapFilesOlderThan(directory, extension, cutoffMs)` as described in Design decisions. It reads the directory's direct entries with file types; a failed read resolves at once. For each entry that is a regular file and whose name ends with `extension`, it stats `path.join(directory, entry.name)` and, when the mtime is strictly before `cutoffMs`, unlinks it. A failed stat or unlink skips that entry. The function never rejects. Add `src/state/reaper.test.ts` (see Tests). No existing file changes. Build command: `$janissary/scripts/run.mjs check-diff`, which must pass (lint, typecheck, and the new server tests) at this step's commit.

## UI design

None. The module has no user-facing surface.

## Tests

All in `src/state/reaper.test.ts`, against a real temporary directory (`mkdtempSync(path.join(tmpdir(), 'janus-reaper-'))` in `beforeEach`, removed with `rmSync(..., { recursive: true, force: true })` in `afterEach`), aging files with `utimesSync` to a fixed old stamp and passing a cutoff computed from that stamp. Every test awaits the call with `await expect(reapFilesOlderThan(...)).resolves.toBeUndefined()`, which is what pins Requirement 11 in each case.

- A `.txt` file whose mtime is before the cutoff is deleted (Requirement 1).
- A `.txt` file whose mtime equals the cutoff, and one whose mtime is after it, are both kept (Requirement 2). Set the equal case's mtime with a whole-second stamp so the cutoff in milliseconds compares exactly.
- An old `.txt` file inside a subdirectory is kept, and the subdirectory itself is kept even when its name ends with `.txt` and its mtime is old (Requirements 3, 4).
- Old files named `old.cast`, `old.txt.bak`, and `old.TXT` are kept (Requirement 5 and the case-sensitive match decision).
- A symbolic link `link.txt` pointing at `target.dat` in the same directory, with the link aged by `lutimesSync` and the target by `utimesSync`, is kept, and so is its target (Requirement 6).
- A directory path that does not exist resolves (Requirement 7).
- A directory holding an old `.txt` file, with its mode set to `0o000`, resolves, and after the mode is restored to `0o755` in `finally` the file is still there. Guard the test with the root `skipIf` (Existing functionality 7) (Requirement 8).
- With `node:fs/promises` partially mocked so `stat` rejects once, of two old `.txt` files the one whose path was passed to the rejected call is kept and the other is deleted (Requirement 9).
- With `node:fs/promises` partially mocked so `unlink` rejects once, of two old `.txt` files the one whose path was passed to the rejected call is kept and the other is deleted (Requirement 10).

For the two mocked cases, mock at the top of the test file with `vi.mock('node:fs/promises', async (importOriginal) => …)` returning the real module with `stat` and `unlink` replaced by `vi.fn` wrappers around the real functions, as `src/file-glob/walk.test.ts:9` does for `readdir` (Existing functionality 5). In each of the two tests, clear the mock and install a single rejecting call with `mockImplementationOnce` (Existing functionality 6), then read the rejected path from the mock's first recorded call. A once-only implementation is consumed by the test that installs it, so it cannot leak into the real-filesystem tests (Assumption 9). `readdir` order is not guaranteed, which is why the assertions name the file by the recorded call rather than by a fixed name.

## Out of scope

- Calling the reaper from anywhere, computing a cutoff from a retention setting, guarding an uninitialized directory, and naming the harness transcript directory: subplan 4 (`product/plans/ready/harness-transcripts-4-retention-sweep.md`) does that.
- A recurring sweep while the app runs (user answer: "Once per launch").
- Recursing into subdirectories, following symbolic links, or matching more than one extension.
- Reporting or logging skipped files or a failed directory read.
- Specs and documentation: the module has no user-visible behavior until subplan 4 wires it, and the spec updates for the sweep belong to that subplan.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Manual sweep against a scratch directory.** Make a scratch directory, for example `temp/reaper-check/`, holding `old.txt` backdated ten days, `new.txt` with the current time, `old.cast` backdated ten days, and a subdirectory `sub/` holding a backdated `deep.txt`. Backdate with `touch -t` and a stamp ten days ago (`date -v-10d +%Y%m%d%H%M` on macOS, `date -d '10 days ago' +%Y%m%d%H%M` on Linux). From the repo root, run the reaper once with a dynamic import, because `tsx -e` rejects a static `import` statement:

   ```
   npx tsx -e "import('./src/state/reaper.ts').then((m) => m.reapFilesOlderThan('temp/reaper-check', '.txt', Date.now() - 86400000)).then(() => console.log('done'))"
   ```

   It prints `done`. Afterwards `ls -R temp/reaper-check` shows `old.txt` gone and `new.txt`, `old.cast`, `sub/`, and `sub/deep.txt` still present. Run the same command with `temp/does-not-exist` as the directory: it prints `done` with no stack trace. A failure looks like any other file removed, `old.txt` surviving, or an error printed instead of `done`. Remove `temp/reaper-check/` afterwards.
