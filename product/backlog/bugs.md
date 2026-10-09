# bugs

## ready

* Give a file navigator in the center tab strip its location button

Existing Bug: The spec promises every file navigator header carries a location button that cycles the tree through left sidebar → center tab strip → right sidebar → left sidebar; observed on a tree opened with `files`: the header has no location button at all, and once docked the button only toggles left ↔ right and never returns the tree to the center strip. Severity: 3/10

Existing Risk: 4/10 - The center strip is where `files` puts a tree by default, so the promised control is missing exactly where most trees start, and a user looking for it has to already know the `files left` / `files right` / bare `files` commands; a docked tree cannot be sent back from its own header at all.

Proposal Risk: 2/10 - Rendering the button at every placement is additive, but a three-way cycle changes a docked tree's control into one that can leave the sidebar, so the sidebar's own strip and the bare `files` command must stay consistent with whatever cycle is chosen.

Proposal: product/specs/file-navigator-tab.md, "Header buttons": "Every file navigator tab's own header carries a **Search files** button, **New file** and **New directory** buttons, a **detail button**, and a **location button**... The location button cycles the tree through left sidebar → center tab strip → right sidebar → left sidebar, one step per click, with a tooltip naming the destination." Reproduce it: in a shell tab run `files`, then read the tree header's buttons. Expected: a location button among them. Observed: the header carries `files-pull`, `files-commit`, `files-search`, `files-new-file`, `files-new-directory`, `files-detail-cycle`, `tab-split`, and `files-collapse-all`, with no location button (`document.querySelectorAll('.files-dock-cycle').length` is 0); running `files left` then shows the button titled "Move to right sidebar", which toggles to the right sidebar and back to the left and never offers the center strip. The root cause is that `FileNavigatorHeader` in `web/src/file-navigator/FileNavigatorHeader.tsx` renders the button only under `{dock && …}`, while `FileNavigatorTab` in `web/src/file-navigator/FileNavigatorTab.tsx` passes `onCycleDock: dock === undefined ? undefined : () => intents.setDock(nextDock(dock))`, and `ViewTabBody.tsx` renders a center-strip tree with no `dock` prop at all; `nextDock` in `web/src/shared/dock-cycle.ts` only ever returns `'left'` or `'right'`. The fix is to give the center placement a dock state — a three-valued `dock` of `'left' | 'center' | 'right'`, or a nullable cycle target the header can always draw — so the button renders for every tree, and to make the cycle pass through the center strip as the spec describes. `web/src/file-navigator/FileNavigatorHeader.test.tsx` and the callers of `nextDock` in `web/src/shared/dock-cycle.ts` are where the button's presence and cycle are pinned; a regression test should render a center-strip navigator and assert the location button exists, click it and assert the tree is docked into the left sidebar, click it again and assert the tree is back in the center tab strip.


* when the laptop goes to sleep then resumes, the application stops with the ui disappearing and the server halting. The application should be tolerant of going to sleep and resuming. After the laptop resumes, the application UI and server should still be present and active. 

## development

## deferred

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
