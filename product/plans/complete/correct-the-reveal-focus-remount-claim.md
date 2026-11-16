# Correct the reveal focus remount claim

**Complexity: 1/10** — a three-passage wording repair with no production code, no tests, and no behavior change (p=1.58).

The pull request description, the canonical plan's "Focus applied exactly once" decision, and one sentence in the editor spec all state an unqualified promise: the `fileNavigatorRevealApplied` acknowledgement means a later remount of the tree cannot replay a focus hint. The mechanism only acknowledges a hint the client applied or dropped. A hint whose cursor row never arrives — the file or an ancestor has gone from disk, a remote listing fails or prunes the path, or the tree unmounts while the hint is still pending — is neither applied nor dropped, so `web/src/file-navigator/useFileNavigatorRevealFocus.ts` never sends the acknowledgement and `src/file-navigator/reveal-editor.ts` keeps `focus: true` on the hint. A mount during that window focuses the tree again.

## Goal

Describe the accepted residue accurately in the three places that promise more than the code delivers, without changing any code or adding a timeout or retry:

- The pull request description's "split between server and client" paragraph says the acknowledgement covers only a hint a client applied or dropped, and that a hint whose cursor row never arrives stays pending server-side, so a mount in that window can take focus once more and the next reveal replaces the hint.
- The canonical plan's "Focus applied exactly once" decision carries the same qualification, using the wording already accepted for this case in the deleted focus-hint subplan: the hint stays pending until a later reveal or an ordinary `files` hint replaces it, and no timer is added.
- `product/specs/editor-tab.md`'s "When the file, or a directory above it, has gone from disk" paragraph states that the focus hint remains pending on the server in that case.

## Approach

Verify the behavior first, then edit only the named passages.

- `src/file-navigator/reveal-editor.ts` writes `focus: true` on the reveal hint, and `clearRevealFocus` removes only that member when the client acknowledges the matching revision. `revealEditorFile` writes a fresh hint with a new revision on every reveal, and `applyViewSteps` in `src/file-navigator/restore-command.ts` writes a fresh hint without `focus` for an ordinary `files` selection, so either replaces a pending hint wholesale.
- `web/src/file-navigator/useFileNavigatorSelection.ts` records a focus hint's outcome as `pending` while its cursor row is absent, and only `applied` or `dropped` reaches `focusHint`.
- `web/src/file-navigator/useFileNavigatorRevealFocus.ts` sends `fileNavigatorRevealApplied` only once the outcome is no longer `pending`, and its focus effect runs on any revision above the module-level floor, which a pending hint never raised. A remount in that window therefore focuses the tree again.
- `web/src/file-navigator/file/navigator-selection.ts`'s `focusHintStatus` returns `pending` for a focus hint whose cursor is absent from `rows`, which is what leaves the server flag in place.

In the pull request description, replace only the clause "so a later remount of the tree (docking or undocking it) cannot replay the hint and pull focus out of the editor" in the "Two new fire-and-forget RPCs ..." paragraph. Leave every other sentence and paragraph byte-for-byte unchanged and leave the title alone.

In `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`, qualify the final sentence of the "Focus applied exactly once" bullet. Keep the rationale for the acknowledgement, but state that it covers only a consumed hint and name the residue: a hint whose cursor row never arrives stays pending until a later reveal or an ordinary `files` hint replaces it, and no timer is added.

In `product/specs/editor-tab.md`, add one sentence to the "When the file, or a directory above it, has gone from disk" paragraph stating that the reveal's focus hint remains pending on the server, because the missing row is never applied or dropped, and that a later reveal or an ordinary `files` hint replaces it.

## Implementation steps

1. Verify the pending-hint path in `src/file-navigator/reveal-editor.ts`, `web/src/file-navigator/useFileNavigatorSelection.ts`, `web/src/file-navigator/file/navigator-selection.ts`, and `web/src/file-navigator/useFileNavigatorRevealFocus.ts`.
2. Qualify the "Focus applied exactly once" decision in `product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`.
3. Add the one sentence to `product/specs/editor-tab.md`'s gone-from-disk paragraph.
4. Remove the resolved entry from `product/backlog/pull-request.md`, leaving the other two entries byte-for-byte unchanged.
5. Promote this plan to `product/plans/complete/` and publish the branch change.
6. After the push, rewrite the named clause in the pull request description through `gh pr edit --body-file ./temp/pr-body.md`, preserving every other paragraph and the title.

## Tests

None — no code, test, or behavior changed. The existing `web/src/file-navigator/FileNavigatorTab.test.tsx` and `web/src/file-navigator/useFileNavigatorSelection.test.ts` cases pin the hold/ack behavior and must pass untouched.

## Verification

Read the three edited passages against `src/file-navigator/reveal-editor.ts` and `web/src/file-navigator/useFileNavigatorRevealFocus.ts` and confirm no code path changed. Run `$janissary/scripts/run.mjs check-diff`; a docs-only change is expected to have nothing scoped to lint, typecheck, or test.

## Out of scope

- Any change to `revealEditorFile`, `clearRevealFocus`, `useFileNavigatorSelection`, or `useFileNavigatorRevealFocus`.
- Any timeout, retry, or client-side clear for a hint whose row never arrives; the accepted no-timeout decision stands.
- Any code, test, or other documentation change.
- The pull request title, and every description paragraph other than the named clause.
- The other two entries in `product/backlog/pull-request.md`.
