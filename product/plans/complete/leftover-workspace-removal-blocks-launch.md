# Clear a leftover workspace without blocking the launch on deleting it

**Complexity: 3/10** — one function changes how it gets a folder out of the way, plus a small new module that owns the trash location and its background deletion. The removal's contract (untrust first, report a failure, refuse the launch on one) stays exactly as it is.

## Bug

When launching a harness with a workspace (`harness <name> -w`, or the remote `on <address>` equivalent), a pre-existing workspace folder under the same label takes a very long time to remove before the launch goes ahead.

## Root cause

`removeLeftoverWorkspace` in `src/launch-name/leftover.ts` deletes the leftover clone and its `.tmp` sibling with a synchronous, recursive `rmSync`. A workspace clone holds a full checkout plus its `node_modules/`, `.git/`, and build output, so that is tens to hundreds of thousands of files unlinked one at a time on the server's event loop. The whole server is frozen for the duration, and the launch (and its clone) can't start until every file is gone.

## Correct behavior

The leftover is cleared as part of the launch, as `product/specs/harness.md` describes, but the launch does not wait on the files being deleted: the folder name is freed at once so the clone can land there, and the old contents are deleted in the background without blocking the server.

## Reproduction

- `temp/time-remove.mjs` copied this checkout's `node_modules/` (28,488 entries, 498 MB) into a scratch folder and timed removing it: synchronous recursive `rmSync` took 1089 ms of blocked event loop; `renameSync` of the same folder took 0 ms. A real workspace clone is several times larger than `node_modules/` alone.
- A new test in `src/launch-name/leftover.test.ts` asserts that after `removeLeftoverWorkspace('foo')` the folder is gone from its name and its contents sit in `.janissary/workspace-trash/`, then disappear asynchronously. Against the current code it fails: nothing is ever moved to the trash, because the contents were deleted inline.

## Approach

Rename instead of delete. A rename within one filesystem is a single metadata operation regardless of the folder's size. The leftover and its `.tmp` sibling are renamed into `.janissary/workspace-trash/<uuid>` — a sibling of the workspace base, not inside it, since every name directly under the base is a valid launch label — and then deleted with the asynchronous `fs.promises.rm`, which never blocks the event loop. Any entries an earlier interrupted deletion left in the trash are swept by the same background pass.

When the rename fails because the trash sits on a different filesystem (`EXDEV`), the removal falls back to the old synchronous delete, so the folder is always cleared. Any other rename failure is reported exactly like a failed removal is today.

## Implementation steps

1. Add `src/workspace/discard.ts` exporting `discardDirectory(dir)` — moves `dir` (if present) into the trash under a fresh UUID, falling back to a synchronous recursive remove on `EXDEV` — and `emptyWorkspaceTrash()`, which deletes every trash entry asynchronously and swallows errors.
2. In `removeLeftoverWorkspace`, keep `untrustWorkspace` first, then `discardDirectory` the folder and its `.tmp` sibling, then start `emptyWorkspaceTrash()` without awaiting it.
3. Update the harness spec's leftover paragraph to say the old contents are deleted in the background.

## Regression test

`src/launch-name/leftover.test.ts` — "moves the folder aside at once and deletes its contents in the background": after `removeLeftoverWorkspace('foo')` returns, `workspace/foo` no longer exists, `.janissary/workspace-trash/` holds the two moved folders, and it is empty again shortly after. The existing removal tests (failure reporting, untrust ordering, refusing a climbing label) keep passing unchanged.

## Verification

- `check-diff` passes, including the regression test.
- Re-run `temp/time-remove.mjs`-style timing: the launch-path removal returns in milliseconds.
- Live check: start a scratch instance whose project is a git repository with a local bare `origin`, so a `-w` clone works offline. Startup sweeps the workspace base, so the driver creates the leftover after the app is up: a copy of `node_modules/` plus a marker file at `$workspace/foo`. It then types `harness claude as foo -w --no-browser` and expects the marker gone, a fresh clone in place within well under a second, the old contents in `.janissary/workspace-trash/` and then deleted, and the "Removed leftover workspace" notification.

## Out of scope

- `removeWorkspace` / `removeWorkspaceStrict` in `src/workspace/index.ts`, used when a workspace tab closes or at shutdown, still delete synchronously. They are not on the launch path this bug reports.
