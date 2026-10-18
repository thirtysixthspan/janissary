# Error-path tests for the untitled create and the delete race
**Complexity: 2/10** — a test-only change to one test file. The one nontrivial part is a `node:fs` mock of `unlinkSync`, which must pass through to the real function for every other case in that file.

## Goal

Pin two error-path behaviors that the runscript file operations already implement but no test covers. The first is the untitled create's tagging of a thrown error with `runscriptName`, so the scripts tab's failure text can name the file. The second is the delete's `false` return when unlink reports `ENOENT` after the existence check passed. Production code does not change.

## Approach

The entry's claims were checked against the current branch. `newUntitledRunscript` sets `runscriptName` on the error it rethrows in `src/schedule/system/runscript-files.ts`. `deleteRunscript` returns `false` when `unlinkSync` throws `ENOENT`. The repair commit `dc6cf5e3` only changed where `makeScriptsDirectory` takes its path from, so the behavior the entry describes is unchanged.

Both cases go into `src/schedule/system/runscript-files.test.ts` beside the existing cases of the same operation.

1. Untitled create through a dangling symlink. In a plain temporary project, `.janissary/scripts/untitled.rs` is a symlink to a missing target. `nextFreeName` follows the link with `existsSync`, reads the name as free, and returns `untitled.rs`. The exclusive write in `createRunscript` fails with `EEXIST`. `readRunscript` then rejects the link as not a regular file, and `newUntitledRunscript` rethrows that error with `runscriptName` set to `untitled`. The case asserts the message matches `/regular file/`, the `runscriptName`, and that the link is still a symlink.

2. Delete race. The test file mocks `node:fs` the way it already mocks `next-free-name`: `importOriginal`, then `unlinkSync` wrapped in `vi.fn` over the real function, with the rest of the module spread through unchanged. The default is the real `unlinkSync`, so every existing delete case still runs against the real filesystem. In the new case, `mockImplementationOnce` removes the file with the real `rmSync`, which is the other process winning the race, and then throws an error with `code: 'ENOENT'`. The case asserts `deleteRunscript` returns `false`, that `unlinkSync` was called with the file path (so the race path ran, not the early return for an absent file), and that the file is gone.

Mock scope: the `node:fs` mock applies to the whole file, but it replaces only `unlinkSync`, and the default delegates to the real function. No other case in the file is expected to change. If that proves false during implementation, the fallback is to narrow the mock further, and the plan and report will record it.

## Implementation steps

1. Add the untitled dangling-symlink case after the existing untitled race case, with no mock. Run `./scripts/run.mjs check-diff` and fix any failure before continuing.
2. Add the `node:fs` mock beside the existing `next-free-name` mock, add `unlinkSync` to the existing `node:fs` named import, and add `import type * as NodeFs from 'node:fs'` beside the existing `NextFreeName` type import. Add the delete race case after the existing delete-symlink case. Run `./scripts/run.mjs check-diff` and fix any failure before continuing.

## Tests

Two new cases, in the file's existing style: `mkdtempSync(path.join(tmpdir(), '<label> '))`, a `try`/`finally` that removes the root with `rmSync`, and full-sentence test names.

- `names the untitled runscript in the error when a dangling symlink blocks the create and leaves the link in place`
- `reports a runscript removed by another process between the check and the unlink as not removed`

No existing case changes.

## Verification

Run `./scripts/run.mjs check-diff` after each step. The full server test file must pass, including every untitled, clone, and delete case that already exists.

## Out of scope

- No production code change. The untitled and delete behavior already exists, and the tests only pin it.
- No spec change. The fix does not change any user-visible behavior, so `product/specs/` is untouched.
- No documentation change. Neither `help.md` nor `documentation/user-documentation/` describes this error text or the race return.
- The existing untitled, clone, and delete cases stay as they are.
- The dangling-symlink case is not added to the delete path, and the delete race is not added to the untitled path.
