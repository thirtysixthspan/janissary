# PR 1128: share the file navigator's button-flash state machine between pull and commit

Complexity: 4/10

## Goal

`src/file-navigator/manager-commit.ts` restates `src/file-navigator/manager-pull.ts` almost line
for line — its own `FLASH_MS`, its own `settle`, its own `rest`, its own still-rooted guard, and
its own entry guard — differing only in which pair of `FilesTabState` fields it writes. Extract
one shared machine so a future third button cannot silently fork it again.

This is a refactor with no behavior change. The existing pull cases in
`src/file-navigator/manager.test.ts` and the commit cases this pull request added there — flash
timing, settle-to-rest, coalescing, tab-closed-mid-flash, notification-posted-after-close — are
the contract, and passing them untouched with no new assertions is what finishing looks like: no
new tests.

## Approach

1. **`src/file-navigator/manager-flash.ts` (new)** — holds `FLASH_MS`, the `settle`/`rest` pair
   (`armFlash`/`restFlash`), and the still-rooted guard (`stillRooted`), parameterized by a small
   descriptor of explicit read/write functions over a `FilesTabState` (`status`, `setStatus`,
   `flash`, `setFlash`) rather than string keys, so field names stay compiler-checked. Also holds
   the two descriptors themselves (`pullFlashDescriptor`, `commitFlashDescriptor`) and
   `clearFlashTimers(state)` over a descriptor list.
2. **`manager-pull.ts`** — keeps only what is genuinely the pull's own: the entry guard's subject
   (both actions' `pulling`/`committing` statuses), the port call, the report text from
   `pull-report.ts`, `invalidateAfterPull`'s cache clearing, and what a settled outcome triggers —
   `clearFilesystemCache` plus `refreshGit`.
3. **`manager-commit.ts`** — keeps the entry guard, the port call, the report text from
   `commit-report.ts`, the nothing-to-commit rest (no flash, straight to rest, no `refreshGit`),
   and `refreshGit` for a landed commit.
4. **`manager-profile.ts`** — `closeTabState` clears flash timers through
   `clearFlashTimers`, so a future third descriptor cannot be forgotten there.
5. The separate `PullContext` and `CommitContext` types stay separate, as the original plan
   decided.

## Out of scope

- Any behavior change — statuses, timing, notification lines, coalescing rules all stay.
- Merging `PullContext`/`CommitContext` into one type.
- New tests.

## Tests

None new; `src/file-navigator/manager.test.ts` must pass untouched. Spec files unaffected (no
user-visible behavior change); help and user documentation unaffected.
