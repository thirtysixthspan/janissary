# Leave the existing row alone when New directory collides with `untitled`

**Complexity: 2/10** — one client action switches from a fire-and-forget `send` to a `request` and arms the auto-rename from the server's reply, plus comment updates and test adjustments in `FileNavigatorTab.test.tsx`. No server or protocol change: the RPC already replies with the created path.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): when a directory named `untitled` already exists at the target, the header's New directory button creates `untitled-2` correctly but then selects the pre-existing `untitled` row and opens its rename field, so typing a name renames the wrong directory.

## Reproduction

A new case in `web/src/file-navigator/FileNavigatorTab.test.tsx`, "leaves an existing untitled directory alone when the server creates untitled-2 beside it": renders a tree that already holds an `untitled` directory row, clicks New directory with a client whose `request` answers `untitled-2`, then rerenders with the `untitled-2` row added. Against the current code it fails: a rename input pre-filled with `untitled` is in the document, opened on the pre-existing row.

## Root cause

`createNewDirectory` (`web/src/file-navigator/file/navigator-menu-actions.ts`) records the guessed path `newDirectoryTargetPath(targetDir)` — always `<target>/untitled` — as the pending new directory and sends the RPC with `client.send`, discarding the server's reply. The effect in `FileNavigatorTab.tsx` then finds the pending path by path equality through `findPendingNewDir`. When `untitled` already exists, that lookup matches the existing row immediately, so it is selected and put into rename. The server already replies with the real created path (`createNavigatorDirectory` returns `result.value.path`, and `fileNavigatorCreateDirectory` is a `deferred` reply method).

## Correct behavior

Per `product/specs/file-navigator-tab.md` ("New directory") and the report's expected outcome: a directory created exactly as `untitled` is selected and its rename field opens once it appears; a directory that took a collision name (`untitled-2`, …) is not auto-selected or auto-renamed, and every other row, including the pre-existing `untitled`, is left untouched.

The report's "likely fix" suggests auto-renaming whatever path the server returns, which would also select `untitled-2`. That contradicts the spec's explicit collision rule and the report's own expected outcome, so this fix uses the server's reply to decide, but only arms the auto-rename when the reply is the un-collided `untitled` path.

## Approach

Send the create with `client.request<string | undefined>(...)`. When the reply is ok and equals `newDirectoryTargetPath(targetDir)` (the path an un-collided creation lands at), set it as the pending new directory; otherwise set nothing. Because the pending path is only ever a path the server just created, it can never match a row that was there before. The effect in `FileNavigatorTab` still waits for the row to appear in `files.rows`, so it works whether the reply or the tree rebuild arrives first.

## Implementation steps

1. `web/src/file-navigator/file/navigator-menu-actions.ts`: in `createNewDirectory`, replace `setPendingNewDir(newDirectoryTargetPath(targetDir))` + `client.send(...)` with `void client.request<string | undefined>(...).then(...)` that sets the pending path only when the reply is ok and equals `newDirectoryTargetPath(targetDir)`.
2. `web/src/file-navigator/file/navigator-new-file.ts`: update the comments on `findPendingNewDir` and `newDirectoryTargetPath` to describe the reply-driven check instead of a guess.
3. `web/src/file-navigator/FileNavigatorTab.tsx`: update the comment above the auto-rename effect the same way.
4. `web/src/file-navigator/FileNavigatorTab.test.tsx`: move the existing new-directory cases from `send` to a `request` mock (asserting the same call), make the auto-rename cases resolve the reply, and keep the new regression case. Add cases for a reply that arrives after the created row already appeared (the rename still opens) and for a failed create (nothing opens).
5. Run `./scripts/run.mjs check-diff` after each step.

## Regression test

`web/src/file-navigator/FileNavigatorTab.test.tsx` — "leaves an existing untitled directory alone when the server creates untitled-2 beside it": asserts no rename field opens and the pre-existing `untitled` row is not selected. Fails without the fix (a rename input pre-filled with `untitled` opens), passes with it.

## Specs and docs

`product/specs/file-navigator-tab.md` "New directory": add that a collision leaves any existing `untitled` row's selection and name untouched. `documentation/user-documentation/tab-types/file-navigator.md` already describes the correct behavior, and `help.md` does not cover it, so neither changes.

## Out of scope

- Auto-renaming a collision-named directory (`untitled-2`, …): the spec explicitly excludes it.
- The New file button, which opens an editor tab rather than a tree row and is unaffected.
- Any server or protocol change.
