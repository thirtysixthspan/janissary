# Runscript file operations for the scripts tab
**Complexity: 3/10** — five file helpers in one existing module, each with a symlink or exclusive-write rule to keep, plus a Git-free listing the one-second refresh can afford.

## Goal

Add to `src/schedule/system/runscript-files.ts` the file operations the scripts tab needs: a public directory setup for when the tab opens, the raw file text on `readRunscript`, a listing that skips the Git step for the tick, and delete, clone, and untitled create. Every existing caller keeps its current behavior.

## Design decisions and dependencies

This subplan depends on nothing earlier. `execute`, `edit`, `create script`, completion, and system schedule firing keep calling the same functions and get the same results.

- The Git-exclusion step stays on every path that reads, catalogs, or creates runscripts, as `product/specs/scheduling.md` and the completed exclude-runscripts plan require. It moves out of `scriptsDirectory` into its own function, so the listing can run without it. The reason is cost: `ensureSystemScheduleExcluded` runs at least five `git` processes per call in a Git project (`rev-parse --show-toplevel`, two `ls-files`, two `check-ignore`), so a tick that called it would spawn those once a second for every open scripts tab.
- One listing serves both paths. `listRunscriptNames(projectRoot)` is exported and skips the exclusion step. `catalogRunscripts` runs the exclusion and then returns that same list, so the sort-and-filter rule has one definition.
- `ensureScriptsDirectory(projectRoot)` is the existing `makeScriptsDirectory` made public. It runs the exclusion step first and then creates the directories, which keeps the order `createRunscript` uses today.
- `readRunscript` gains a `text` field, the raw file contents, or an empty string when the file does not exist. Clone needs the comments and blank lines that `parseRunscriptText` drops. Existing callers ignore the field.
- `deleteRunscript(projectRoot, name)` calls `readRunscript` first, so a symlink or non-regular file throws before anything is removed. It returns `true` when it removed a file and `false` when the file was already absent. It throws for an unsafe path.
- `cloneRunscript(projectRoot, name)` reads the source through `readRunscript`. It returns `undefined` when the source is absent and throws for an unsafe source. Otherwise it picks the target with `nextFreeName` on `<name>.rs`. The source exists at that point, so `nextFreeName` starts counting at `-2` and then `-3`. It writes the raw `text` with the exclusive write flag and returns the new name. Rejected: building `<name>-2` by hand, which would duplicate `nextFreeName`'s counting.
- `newUntitledRunscript(projectRoot)` picks `untitled.rs` through `nextFreeName`, strips the extension, calls `createRunscript` with the result, and returns the name. If a race makes the name taken, `createRunscript` returns the existing file, and the function returns that name without overwriting it. If creation throws, the function rethrows an error that carries the chosen name in a `runscriptName` property, so the caller can name the file in its failure text.
- The exclusive create is written once and used by `createRunscript` and `cloneRunscript`, so the `wx` flag and its `EEXIST` handling are not duplicated.
- The runscripts directory path is computed by one helper, so `nextFreeName`, the reads, and the writes all agree on it.
- A symlinked or non-directory `.janissary` keeps throwing from `assertDirectory`, as it does today. Callers decide what that means. The tick treats it as an empty list, and the actions report it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Runscript read, create, catalog, directory checks | `src/schedule/system/runscript-files.ts` (`readRunscript`, `createRunscript`, `catalogRunscripts`, `scriptsDirectory`, `assertDirectory`, `makeScriptsDirectory`) | Modified in place. Stays well under 200 code lines. |
| Name validation and line parsing | `src/schedule/system/runscript.ts` (`isRunscriptName`, `parseRunscriptText`) | Reused unchanged. |
| Free-name selection | `src/editor/next-free-name.ts` (`nextFreeName`) | Chooses the clone name and the untitled name. Its `existsSync` check follows symlinks, so a dangling symlink reads as free. The exclusive write then fails with `EEXIST`, and the refusal path turns that into an error. |
| Git exclusion | `src/schedule/system/local-exclude.ts` (`ensureSystemScheduleExcluded`) | Reused unchanged. It is called only from the exclusion step, never from the listing. |
| Cached catalog | `src/state/listings.ts` (`cachedRunscripts`) | Not used. Its one-second TTL would add up to a second of lag, and it hides errors. See `03-runscript-tick-refresh`. |

## Proposed changes

In `src/schedule/system/runscript-files.ts`:

- Split the exclusion call out of `scriptsDirectory`, so `scriptsDirectory` keeps its current result and a new inspection function returns the path and existence without running Git.
- Add `listRunscriptNames(projectRoot)`, which returns the sorted valid runscript names from the directory without the exclusion step. Symlinks, directories, non-`.rs` files, and invalid names are left out, as the catalog rule already says.
- Make `catalogRunscripts` run the exclusion step and then return `listRunscriptNames`. Its behavior and callers do not change.
- Export `ensureScriptsDirectory(projectRoot)`, which runs the exclusion step and then creates `.janissary/` and `.janissary/scripts/` when they are missing.
- Add the `text` field to the object `readRunscript` returns.
- Add a private exclusive-create helper used by `createRunscript` and `cloneRunscript`.
- Add `deleteRunscript`, `cloneRunscript`, and `newUntitledRunscript` with the return types described above.

## Tests

In `src/schedule/system/runscript-files.test.ts`, as added cases beside the existing ones:

- `ensureScriptsDirectory` creates `.janissary/` and `.janissary/scripts/` in a plain temporary directory. A second call changes nothing. A symlinked `.janissary` throws.
- In a real temporary Git repository, `ensureScriptsDirectory` leaves `.janissary/scripts/` ignored by Git afterwards, which shows the exclusion step ran before the directory was made.
- `listRunscriptNames` returns sorted valid names and leaves out invalid names, non-`.rs` files, directories, and symlinks. It writes nothing to `.git/info/exclude` in a Git repository.
- `readRunscript` returns `text` with full-line comments, inline comments, blank lines, and CRLF endings intact, and its `lines` are unchanged. For a missing file, `text` is an empty string.
- `deleteRunscript` removes a regular file and returns `true`. For a missing file it returns `false`. For a symlink it throws and leaves the link target in place. For a non-regular file it throws.
- `cloneRunscript` on `deploy` creates `deploy-2.rs`. With `deploy-2.rs` already present it creates `deploy-3.rs`. The copy's bytes equal the source's, comments and blank lines included. It returns the new name. A symlinked source throws. A missing source returns `undefined`.
- `cloneRunscript` never overwrites: with `nextFreeName` mocked to return a name that already exists, the call throws and the existing file keeps its bytes.
- `newUntitledRunscript` returns `untitled` on the first call and `untitled-2` on the second. With `nextFreeName` mocked to return a name that appears between choosing and writing, it returns that name and does not overwrite the file.
- The existing `createRunscript` cases pass unchanged.

## Verification

Run `./scripts/run.mjs check-diff`. The existing `execute`, `edit`, `create script`, and completion tests must pass without edits. Confirm by reading the diff that `scriptsDirectory` still runs the exclusion step on every path that did before.

## Out of scope

- No file watcher, no timer, and no change to the catalog rule, the name grammar, or `parseRunscriptText`.
- No topic, action, plugin, or UI code. The new functions are used by `03-runscript-tick-refresh` and `04-runscripts-topic-and-actions`, so until 04 lands they are exported but unused. ESLint does not flag that. `knip`, run only by `npm run check:full`, does.
