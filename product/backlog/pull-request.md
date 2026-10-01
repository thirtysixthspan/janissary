<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the files-changed list's reference to a shared context-menu module, which does not exist, and drop the chord entry it lists twice.

Existing Issue: The pull request description's files-changed section names `shared/context-menu` as the home of the new entry, its anchor capture, and the published `pasteTextInto`, but the code is in `web/src/context-menu/default-menu-target.ts` and `web/src/context-menu/useDefaultContextMenu.ts`, which is a feature directory and not under `web/src/shared/`, and the same section lists `web/src/overlay-plugins/chords.ts` as two separate bullets where the second explains the `eventChordId` distinction. Severity: 3/10

Existing Risk: 3/10 - The list is the map an agent or reviewer uses to find the change, so a path that resolves to nothing sends the reader hunting through the shared directory while the description simultaneously implies the context-menu code sits on the wrong side of the boundary this pull request's own lint rules enforce.

Proposal Risk: 1/10 - Only prose changes, so the only way to be wrong is leaving a path that no longer matches the tree, which the next read of the diff catches immediately.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1499: correct the context-menu path and the duplicated chord entry in the description". In the pull request description, change the `shared/context-menu` bullet to name `web/src/context-menu/default-menu-target.ts` and `web/src/context-menu/useDefaultContextMenu.ts`, and check the rest of that section's paths resolve against the tree as it stands, since the same section already refers to the seams correctly under `web/src/shared/`. Merge the two `web/src/overlay-plugins/chords.ts` bullets into one that carries both the chord ids and the reason `eventChordId` exists. Nothing in the code changes, so no test applies; verify by re-reading the section against `git diff origin/master...HEAD --name-only` after editing.

