# Correct the pull request's restart verification step

**Complexity: 1/10** — no production code, files, requirements, scenarios, or units (p=1.578); the work is one verification step in the pull request's description, a backlog removal, and a plan note.

## Summary

The description's How to verify step 16 tells the reader to leave the page open, restart the server, and wait for the page to reconnect. That cannot happen. `src/main.ts` passes a fresh `makeToken()` to `startServer` on every boot, `<server>` refuses a socket upgrade whose token does not match, and `web/src/shared/ws/session-url.ts` builds the reconnect URL from `location`, so the old page retries the token in its own address bar and stays on `Reconnecting…`. The restarted app is only reachable at the address it prints. The behavior the step was meant to exercise, the client's acknowledged-revision floor staying below the restarted server's first revision, is not observable from a browser at all: the floor is a module-level map in `web/src/file-navigator/useFileNavigatorRevealFocus.ts`, so a page opened at the new address is a fresh document with an empty floor.

## Design decisions

1. **The step reopens the page at the newly printed address.** That is the only route back into a restarted app, and it replaces the reconnect sentence rather than adding a caveat beside it. A reader who leaves the old tab open sees a dead page and cannot tell whether the feature or the step is wrong.

2. **The step keeps the browser-observable half and names the rest.** A fresh page against a restarted server must reveal a file exactly as step 1 does. The acknowledged-revision floor is test-only, so the Expect line says it is not observable from a browser reload and is covered by the server and client tests rather than pretending the step demonstrates it.

3. **The canonical feature plan carries the same wrong expectation.** `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`'s Verification list has a "Manual, after a restart" item that repeats the open-page reconnect story. It is not edited in this task, because this task's scope is the description correction; the replacement wording is recorded below so the later PR update can fold it into the plan.

4. **Only step 16's Do and Expect lines change in the description.** Its heading, the Setup and Happy-path and Edge-case steps, and the whole `### Additional test cases` section stay byte-for-byte. The correction names one step, so only that step moves.

5. **No regression test.** The behavior the old step claimed to check is already pinned by `src/file-navigator/restore.test.ts` (the restarted process's first revision lands above the previous process's) and `web/src/file-navigator/FileNavigatorTab.test.tsx` (a lower revision is ignored before a higher one focuses and acknowledges). A description correction has no test surface of its own.

## Proposed changes

1. **The pull request's description, step 16.** After the push, replace its Do and Expect lines with:

   > Do: Restart the app: run `quit` in the command bar, confirm, then start it again with the same scratch command. Open a page at the newly printed address, reopen a file navigator and an editor on a nested file, and click the folder button.
   >
   > Expect: the navigator retargets and selects the file with the tree focused, exactly as in step 1. (The acknowledged-revision floor surviving a restart is not observable from a browser reload; it is covered by the server and client tests.)

   The sentence being removed is "With the page still open, restart the server process and wait for the page to reconnect." Its companion in the old Expect, "rather than the fresh hint being treated as an already-consumed revision", goes with it, since no browser reload can show that.

2. **`product/backlog/pull-request.md`.** Remove the resolved entry whole. It is the file's only entry, so restore the comment-and-heading skeleton.

3. **This plan.** Publish it under `product/plans/complete/`.

4. **Recorded for a later PR update, not applied here.** The canonical plan's Verification item should read:

   > - Manual, after a restart: restart the server, open a page at the newly printed address, and reveal a file in a file navigator. The navigator retargets and selects the file with the tree focused, exactly as in the local step. The acknowledged-revision floor surviving a restart is not observable from a browser reload; it is covered by the server and client tests.

## Tests

None. No production code, test, or spec changes. `./scripts/run.mjs check-diff` assembles an empty tool list because nothing under `src/` or `web/` changes, and that is the expected result.

## Out of scope

- Any change to `src/main.ts`, `src/security.ts`, `src/file-navigator/restore.ts`, or the client's reconnect URL. The server is meant to mint a new token on every boot, and the client is meant to retry the address it was loaded from.
- Any change to the functional specs. `product/specs/editor-tab.md` and `product/specs/file-navigator-tab.md` already describe the reveal and its focus hint without claiming a page can reconnect across a restart.
- Editing the canonical feature plan in this task. Its correction is recorded above.
- Any other paragraph of the description, and the title.

## Verification

- `./scripts/run.mjs check-diff`.
- `gh pr view <reference> --json body` and compare the result with the body captured before the edit: step 16's Do and Expect differ, and every other line, including `### Additional test cases`, is unchanged.
- Confirm the PR is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD`.
