# Pair each state-directory subsystem's init and clear in one registry

**Complexity: 4/10** — one new module holding the ordered init/clear registry, `boot()` rewired to fold over it, and one boot-path test the flat lists could not have. No behavior change: boot order and the relaunch condition are preserved exactly.

`boot()` in `src/main.ts` calls twelve per-subsystem init functions as one flat, order-sensitive list and, on a non-relaunch start, seven per-subsystem clear functions (plus the always-run remote-file-cache clear) as a second flat list with no structural tie between an init and its clear. A subsystem wired in with its init but not its clear leaks the previous session's data into a fresh session.

## Goal

An ordered registry of init/clear pairs (`src/state-dirs.ts`) that `boot()` folds over: init every entry, then clear every entry — always for the cache-style entries, only on a non-relaunch start otherwise — so a new subsystem registers one entry instead of editing two list-shaped lines.

## Design decisions

**Entries carry a stable `name`, an `init`, an optional `clear`, and an `always` flag for the remote-file-cache entry, whose clear keeps running even on a relaunch (as it does today, explicitly).** `initGlobalHistory` has no clear (an in-memory buffer), the transcript logger and store are constructor-inits (the logger is never cleared, the store's clear is static). Everything else pairs one-for-one.

**The package root and project dir travel as a single options object** (`initStateDirectories(options, clearAlways)`-shaped fold), because the profiles init needs the package root (`import.meta.dirname`'s parent) and everything else takes the project dir — the registry keeps accepting both, injected from `boot()`.

**A compile-time completeness pin in the style of `MANAGER_DISPOSE_ORDER_IS_COMPLETE`:** the registry keys are exhaustively checked against a named list of the subsystems' keys in both directions (an init added without a key in the known list fails the assignment; a stale known-list key with no entry fails too).

**The clear order follows the registry order.** Today's clear list ordered the transcript store second; the entries' directories are disjoint and nothing consumes them between the clears at boot, so the registry's order is behaviorally identical — stated here rather than left implicit.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Every init and clear function | `src/agent/state.ts`, `src/harness/{capture-file,recording-file,transcript-file}.ts`, `src/browser/browser-log.ts`, `src/global-history.ts`, `src/connections.ts`, `src/profiles.ts`, `src/workspace/index.ts`, `src/file-navigator/remote-file-cache.ts`, `src/transcript/{logger,store}.ts` |
| The completeness-check style | `MANAGER_DISPOSE_ORDER_IS_COMPLETE` (`src/managers.ts`) |
| The launch options | `parseCliArgs` + `import.meta.dirname` in `boot()` |

## Implementation steps

1. **`src/state-dirs.ts`** (new): the ordered entries array, the public `initStateDirectories(options)` / `clearOnNonRelaunchStart()` pair (always-entries excluded from the relaunch condition), and the completeness type check.
2. **`src/main.ts`**: `boot()` calls the initializer instead of the twelve init lines and the clear blocks; the surrounding calls (`loadConfig`, `scaffold`, lock acquisition, the state-directory CHANGE integration) keep their places and relative order.

## Tests

- **`src/state-dirs.test.ts`** (new) — each source module's init/clear is mocked; the test asserts: every entry's init runs in registry order on a plain start; every entry's clear runs on a non-relaunch start; no entry's clear runs on a relaunch start except the `always` one; the transcript logger and store constructors are called in order; the profiles init receives `projectDir` and package root.
- **`src/main.test.ts`** (if the boot wiring is exercised anywhere today) — unchanged; `check-diff` gates.

## Spec

`product/specs/state-directory.md` states the session clearing behavior already; the registry changes no user-visible behavior — `Spec: none needed (refactor only)`. Confirm the spec file's wording does not name the flat lists; correct nothing if it already describes keeps-clear semantics.

## Out of scope

- Changing a subsystem's parse/insert order (`agentNames` before `harnessModels` remains `loadConfig`'s domain — the registry only holds the `init`-and-clear pair modules listed in the debt item).
- `janus init` scaffolding or `stopInstance`.
