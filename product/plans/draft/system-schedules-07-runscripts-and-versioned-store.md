# System schedules 07: runscript files and versioned atomic storage

**Complexity: 5/10**

Validated disk formats, atomic-write failure behavior and arbitrary-project Git exclusion are the substantive work. Scheduler timing, queue delivery and command/UI integration are outside this storage tranche.

## Goal

Provide pure runscript parsing, project-root runscript lookup/catalog, and durable schedule-file storage. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: none in code; implement after 03–06 to keep the published sequence linear. Plans 03/04 establish the shell ensure/recovery seam, 05 adds client generation reporting, and 06 isolates profile handling.
- Runscripts live at `<project>/.janissary/scripts/<name>.rs`. A name is lowercase alphanumeric words separated by single hyphens (`morning-checks`); no separators, dot segments, spaces, uppercase variants, or explicit `.rs` suffix in the name-taking commands. Resolve against the project, never a tab cwd/workspace. The extension is implied.
- Parse one complete command per physical line, ignore blank lines and lines whose first non-whitespace character is `#`, handle CRLF, and preserve command text/inline shell comments. No shell parsing or multiline joining. Read afresh for every request; empty scripts are valid no-ops.
- Store schema v1 is `{ version: 1, entries: SystemScheduleEntry[] }`. `SystemScheduleEntry` extends the reused `ScheduleEntry` with an immutable opaque `key` and `script` name. `entry.id` remains the displayed/user-managed schedule name, so repeated names get separate keys. `command` is the descriptive invocation `script <name>`, never the expanded file contents. Persist raw `nextRun` and recurrence fields, not formatted display time.
- A missing schedule file loads as empty. Corrupt/unknown-version/invalid-entry files are reported as nonfatal load errors, execute nothing, and are left untouched until an explicit valid mutation; do not silently reinterpret a future schema. Validate finite timestamps, recurrence invariants, unique opaque keys, and valid script names. Scripts need not still exist at load time; missing-at-fire is an owner outcome in 11.
- Use synchronous `atomicWriteFile` for each mutation. No pending/debounced write and no second timer are needed; `dispose` later waits for any in-flight owner operation and synchronous writes have nothing buffered. Failed writes preserve the previous valid file and do not acknowledge a successful mutation.
- Every launch clear retains both paths. `clearStateDirectories()` has no argument and every registered `clear` runs unconditionally; durable paths must stay outside those cleared directories, not depend on a launch mode or the removed `always` field. This repository already ignores `.janissary/`, but `janus` also targets arbitrary projects and `scaffoldProject` currently installs no ignore rule. Ensure the target schedule file is excluded from ordinary Git staging before creating it: honor an existing ignore, otherwise add a project-relative entry to that repository's local Git exclude file resolved with `git rev-parse --git-path info/exclude` (including worktrees/subdirectory project roots). Preserve existing exclude content and do not modify a user's tracked `.gitignore`. For non-Git projects there is no staging boundary to configure. Test the actual target with Git rather than assuming this checkout's ignore applies everywhere. This is local user-authored execution with ordinary shell authority, not a workspace or an added sandbox.

## Existing code to reuse

`src/atomic-write.ts`, `src/schedule/{types,time,parsing}.ts`, project-root `TabManager.launchDir`, and `src/state/dirs.ts`'s explicit clear list. Keep parser I/O-free. No package or schema-validation dependency is needed.

## File scope

- New `src/schedule/system/{types,store,store-decode,runscript,runscript-files,local-exclude}.ts`. The source's two suggested modules may be split here to keep parsing, I/O, and validation focused and below 200 lint-counted lines.
- `src/state/dirs.ts` only if adding a path-initialization registry entry; any such entry has no clear and must update `KNOWN_STATE_DIRECTORY_KEYS`. Prefer injected project-root paths over process-global storage state. Existing `.gitignore` is a read-only reference; target-local exclusion is owned by `local-exclude.ts`.
- Tests: new colocated tests for the six modules; `src/state/dirs.test.ts`, `src/gitignore.test.ts`, `src/atomic-write.test.ts` if needed for the existing writer seam; new `src/schedule/system/storage.integration.test.ts` for real filesystem/clear/reload/Git behavior. Read `src/project/init.ts` for the arbitrary-project boundary; no scaffold behavior change is needed.
- Specs: `product/specs/{state-directory,scheduling}.md` for delivered storage and runscript rules.

## Ordered changes

1. Define `SystemScheduleEntry`, schema and decode-result contracts for 11/12/14. Make unique entry identity independent of duplicate display names.
2. Implement pure text parsing and strict name validation; implement project-root file reading, exact path reporting, and an alphabetically sorted catalog of existing regular `.rs` files with valid names. Directory discovery creates nothing.
3. Implement validated load and atomic save, including explicit error outcomes and preservation of corrupt/unsupported data on mere boot/read.
4. Enforce target-local schedule exclusion before first save, verify startup clear retention and gitignore behavior, and update the state-directory and scheduling specs. An exclude-write failure is an ordinary store-save failure and does not acknowledge creation. Preserve unrelated Git exclude content and use argument-safe Git invocation rather than shell interpolation.

## Tests and verification

Test comments, whitespace, CRLF, inline `#`, single-line constructs, empty scripts, invalid/traversal names, implied extension, exact missing-file path, deleted scripts, edits between reads, and catalog filtering. Store tests cover round trip, repeated names with distinct keys, missing/corrupt/unknown version, invalid recurrence/timestamps, duplicate keys, atomic rename, interrupted-write failure cleanup, and preservation of the previous snapshot on error. Git tests cover a target with no ignore, an existing ignore, existing exclude contents, a worktree, project paths beneath the repository root, non-Git projects, and exclude-write failure.

Run `./scripts/run.mjs check-diff`. Scope E2E uses a real scratch `.janissary/`: initialize the actual state-directory registry, write a script and schedule snapshot with the public services plus sentinel artifacts in per-run directories, call `clearStateDirectories()`, construct a fresh store, and assert schedule/script byte preservation while the per-run sentinels are removed. Repeat the init/clear cycle for a subsequent startup. Rewrite the script between reads and verify changed lines without editing the stored entry. Use real filesystem atomic writes for the success path, not only mocks. Final app-restart coverage is in 16.

## Boundaries

No ticking, boot recovery, command registration, file creation UI, or remote script store. This plan supplies reusable files/data services; 11 owns state mutation and scheduling lifecycle, 13 owns edit/execute behavior.
