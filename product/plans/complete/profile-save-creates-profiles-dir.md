# Make `profile save` create the project's `profiles/` directory

**Complexity: 2/10**. The save creates the directory it writes into, and a write failure is reported against the profile file rather than the temporary file beside it. Both changes sit in `saveProfile`.

## Root cause

`initProfileDir` in `src/profiles.ts` only records where the project and Janissary profile directories are. It never creates either. `saveProfile` in `src/profile/save/index.ts` hands `profiles/<name>.json` to `atomicWriteFile` in `src/atomic-write.ts`, which writes `<file>.<uuid>.tmp` next to the target and renames it into place. On a project that has never had a `profiles/` directory, the first `writeFileSync` throws `ENOENT`. The error names the temporary file, and `ProfileManager.finish` in `src/profile/manager.ts` prints it as `Profile command failed: ENOENT: no such file or directory, open '<project>/profiles/<name>.json.<uuid>.tmp'.` Every existing save test creates `profiles/` in its `beforeEach`, so nothing covered a fresh project.

## Correct behavior

`product/specs/profiles.md`: "saves always write to the project directory", and `profile save <name>` "Captures the running session into a single `profiles/<name>.json`". So on a project without `profiles/`, the save creates it and writes the profile, reporting the usual `Saved profile "<name>": …` summary. When the write can't happen at all (for example `profiles` exists but is a file, or the directory is read-only), the failure names the profile and its file, not a temporary path.

## Reproduction

The bug report reproduced it live: `profile save scratchprofile` on a fresh scratch project failed with `Profile command failed: ENOENT: no such file or directory, open '/…/work/profiles/scratchprofile.json.5caf6ba8-….tmp'.` and wrote nothing, and the same save succeeded after `shell mkdir -p profiles`. New cases in `src/profile/save/index.test.ts` › "saveProfile on a project that has never had a profiles directory", written before the fix, fail against it:

- "creates profiles/ and writes profiles/<name>.json" threw `ENOENT: no such file or directory, open '…/profiles/scratchprofile.json.227d114c-….tmp'`.
- "names the profile file, not a temporary path, when the write fails", with `profiles` created as a regular file, threw `ENOTDIR: not a directory, open '…/profiles/scratchprofile.json.09d7be44-….tmp'`.

## Approach

`saveProfile` creates the profile file's directory (`mkdirSync(…, { recursive: true })`) just before writing it. A failure of either step is rethrown as `could not write profile "<name>" to <file> (<code>)`, which `ProfileManager` prints after `Profile command failed:`.

Creating the directory on save rather than at startup keeps a project that never saves a profile free of an empty top-level `profiles/` directory. The bug report's proposal risk raised that. `initProfileDir` stays a pure path assignment, and the spec line naming it doesn't need to change beyond pointing at the right file.

Rejected: creating `profiles/` in `initProfileDir` at startup. It fixes the save, but it adds an untracked directory to every project on every launch. Also rejected: creating the directory inside `atomicWriteFile`. That helper has other callers, and quietly creating parent directories for all of them is a wider change than this bug needs.

## Implementation steps

1. `src/profile/save/index.ts`: create the directory before the write; wrap both in the profile-named failure.
2. Tests: the two cases above.

## Regression test

`src/profile/save/index.test.ts` › "saveProfile on a project that has never had a profiles directory" › "creates profiles/ and writes profiles/<name>.json", and "names the profile file, not a temporary path, when the write fails".

## Verification

Run `./scripts/run.mjs check-diff`. Live: build the fix, start a scratch instance under `./temp/fix-a-bug/` on a fresh working directory with no `profiles/`, and drive it with `./temp/fix-a-bug-drivers/verify.mjs`. The driver runs `newfile prof.md` so there's a tab to capture, then `profile save scratchprofile`, `profile validate scratchprofile`, and `profile list`, recording each reply. Expected: a `Saved profile "scratchprofile": …` summary, `Profile "scratchprofile" is valid.`, and `scratchprofile` in the list. Afterwards the scratch working directory holds `profiles/scratchprofile.json`.

Outcome: verified. On a fresh working directory holding only `.janissary/`, `newfile prof.md` opened an editor tab, and `profile save scratchprofile` answered `Saved profile "scratchprofile": 1 editor tab, layout. Window size not captured (no window open).` `profile validate scratchprofile` answered `Profile "scratchprofile" is valid.`, and the working directory then held `profiles/scratchprofile.json`. The first driver only kept the tail of the `profile list` reply, so a second instance ran `profile list` alone, and it listed `scratchprofile` ahead of the built-ins `debugging`, `features`, `multitasking`, `planning`, and `product-review`.

Two environment notes from this run. The sandbox refuses loopback connects above roughly port 65,100, and the OS had been handing out ephemeral ports sequentially into that band, so the server's own `src/index.test.ts` failed with `connect EPERM` on unmodified `master` too. Binding and releasing throwaway loopback ports until the allocator wrapped back to 49152 cleared it. Separately, starting the second instance with `--relaunch` made the launcher print the first run's address, because the log is appended to under `--relaunch` and the launcher returns the first `__JANUS_URL__` line it finds. That looks like a separate launcher bug and is not part of this fix.

## Spec and docs

- `product/specs/profiles.md`: says that the first `profile save` creates `profiles/` when the project has none, and that a write failure names the profile file. `initProfileDir`'s location is corrected to `src/profiles.ts`.
- `documentation/user-documentation/automation/profiles.md` already says the save writes `profiles/<name>.json` and reports failures as `Profile command failed: <reason>.`, so it doesn't change. `help.md` doesn't describe the directory.

## Out of scope

- `atomicWriteFile`'s behavior for its other callers.
- Where built-in profiles are read from.
