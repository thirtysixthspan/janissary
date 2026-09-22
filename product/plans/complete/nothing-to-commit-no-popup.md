# Nothing-to-commit commit clicks skip the message field

Issue: in the file navigator, do not attempt to commit changes to origin when there are no
changes available. No popup asking for a commit message. Only a warning should be issued in the
notifications tab.

Complexity: 5/10

## Goal

Today, clicking the file navigator header's **Commit changes to origin** button on a clean tree
still opens the commit-message field pre-filled with `sync: 0 files`, and confirming it runs the
whole stage-commit-rebase-push cycle only for git to find nothing staged and report
`Nothing to commit`. The header button should refuse up front: when the tree's root has no
changes at all, clicking it must not open the message field, must not send the commit RPC, and
must instead land the same `Nothing to commit` warning line in the notifications feed.

The client already holds the exact fact it needs: `changedCount` on the `FileNavigatorView`
payload is the count of every file git considers changed under the tree's root — the same count
the default message is generated from, and the same set the whole-tree commit stages. `0` means
the whole-tree commit would find nothing to commit, so the gate is exactly equivalent to the
server's own nothing-to-commit outcome (not an approximation like the per-selection case below).

## Approach

- **Server — one narrow client RPC.** The notifications tab is a server-side tab, so the client
  cannot append the warning itself; it asks the server to post the line. Add
  `fileNavigatorNothingToCommit` (`params: { index: number }`, reply mode `ack`), wired exactly
  like `fileNavigatorPull` (the pull is the template at every layer):
  - `src/protocol/file-navigator.ts`: add the call to `FileNavigatorRpcCall`.
  - `src/client-message.ts`: `fileNavigatorNothingToCommit: 'ack'`.
  - `src/client-params/file-navigator.ts`: `fileNavigatorNothingToCommit: (p) => isInteger(p.index)`.
  - `src/message-handler-file-navigator.ts`: add the method to the `FileNavigatorMessage`
    extract and a dispatch case.
  - `src/controller/file-navigator-adapter.ts`: adapter entry delegating to the wrapper.
  - `src/controller/file-navigator-commit.ts`: add `fileNavigatorNothingToCommit(managers,
    index)` beside `fileNavigatorCommit` — resolve the tab index to its label and post
    `notify(managers, 'file-operation', label, NOTHING_TO_COMMIT_TEXT)` (reusing the existing
    `commit-report.ts` text), a no-op when the index has no label. Direct `notify` from the
    controller adapter layer matches `controller/editor-adapter.ts`'s `editorPluginFailed`.
- **Web — gate the header button's whole-tree form.** `useFileNavigatorIntents` gains a
  `nothingToCommit` intent sending the new RPC. In `FileNavigatorTab.tsx`, `commitEverything`
  checks `files.changedCount === 0` first: if so it sends the nothing-to-commit intent and
  returns without calling `commit.request`, so no message field opens and no
  `fileNavigatorCommit` RPC is sent. `changedCount` absent (git metadata not yet loaded — the
  commit button is hidden until the branch text that arrives with it, so this is defensive)
  keeps today's behavior.
- **Row menu unchanged.** The row menu's `Commit to origin` acts on named paths whose
  commit-ability is not client-knowable: `commitRoot` checks the whole index, so pre-staged
  changes the selection does not name (staged outside the tree, or staged under it but
  unselected) would still land, and gating those would wrongly swallow the user's own staged
  work. It keeps opening the field, and the server's existing `Nothing to commit` line remains
  its answer for an all-unchanged selection.

## Implementation steps

1. Server surface: the six wiring changes above.
2. Web intent + `commitEverything` gate.
3. Tests (below), run after each step with `check-diff`.

## Tests

- `src/client-params/file-navigator.test.ts`: valid `{ index }` params accepted; bad params
  rejected.
- `src/message-handler.test.ts`: the dispatcher routes `fileNavigatorNothingToCommit` to
  `controller.fileNavigatorNothingToCommit(0)`.
- `src/controller/file-navigator.test.ts`: the wrapper posts the notifications line
  (`Nothing to commit`) attributed to the resolved tab label; no-op when the index has no label.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: header commit click with `changedCount: 0`
  sends `fileNavigatorNothingToCommit` and opens no commit-message field; `changedCount: 3`
  still opens the field (and the existing tests cover the unchanged popup flow); the row menu's
  `Commit to origin` still opens the field.
- `web/src/file-navigator/useFileNavigatorIntents.test.ts`: the new intent sends the RPC.

## Out of scope

- The row menu's `Commit to origin` and the editor tab's commit icon keep their current flows.
- No change to the server's `runCommit` — it stays the backstop that reports
  `Nothing to commit` after a real attempt (selections, races).

## Specs / docs

- `product/specs/file-navigator-tab.md` ("Committing to origin"): the header button on a tree
  with no changes opens no field and runs no commit; the `Nothing to commit` line is the answer
  either way.
- `documentation/user-documentation/tab-types/file-navigator.md` ("Committing your changes to
  origin"): same behavior in user language.
- `help.md` documents none of this; no update there.
