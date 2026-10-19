# Give a file navigator in the center tab strip its location button

**Complexity: 2/10** — a client-only change in three small files plus a new pure module. The server's `setDock` RPC already accepts `null` (undock to the center strip), so no protocol, server, or other dockable kind changes.

## Root cause

`FileNavigatorHeader` (`web/src/file-navigator/FileNavigatorHeader.tsx`) renders the location button only under `{dock && …}`, and `ViewTabBody` renders a center-strip tree with no `dock`, so a center tree has no button. `FileNavigatorTab` wires the click to `intents.setDock(nextDock(dock))`, and `nextDock` in `web/src/shared/dock-cycle.ts` — written for the notifications tab's left↔right toggle — only ever returns `'left'` or `'right'`, so a docked tree can never be sent back to the center strip from its own header. `useFileNavigatorIntents.setDock` is also typed `'left' | 'right'`, so it cannot express the undock.

## Correct behavior

Per `product/specs/file-navigator-tab.md`, "Header buttons": every file navigator header carries a location button, and it cycles the tree left sidebar → center tab strip → right sidebar → left sidebar, one step per click, with a tooltip naming the destination. So a center tree's button says "Move to right sidebar", a left-docked tree's says "Move to center tab strip", and a right-docked tree's says "Move to left sidebar".

The backlog entry's suggested regression test (center → left → center) does not follow the cycle order the same entry quotes from the spec (center → right); the spec is authoritative, so the test follows the spec's order.

The notifications tab, schedules tab, and docked plugin tabs keep their own spec'd left↔right toggle (`notifications.md`, `scheduling.md`) and keep using `nextDock`.

## Reproduction

- Unit: in `FileNavigatorTab.test.tsx`, rendering a center navigator finds zero `.files-dock-cycle` elements; rendering one with `dock="left"` finds no button titled "Move to center tab strip".
- Live (unfixed build of `master@b87edfc9`, scratch instance, attached browser): `files` opens a center tree whose header actions are `files-github, files-pull, files-commit, files-search, files-new-file, files-new-directory, files-detail-cycle, tab-split, files-collapse-all` with no location button. `files left` docks it with a button titled "Move to right sidebar"; three clicks go left → right → left → right, never the center strip.

## Approach

Add a file-navigator-specific location cycle beside the detail cycle, `web/src/file-navigator/file/navigator-location.ts`: `nextLocation(dock?: 'left' | 'right'): 'left' | 'right' | null` (left → null, null → right, right → left) and `locationTooltip(next)` ("Move to left sidebar", "Move to center tab strip", "Move to right sidebar"). The header renders the button unconditionally with that tooltip; `FileNavigatorTab` always passes `onCycleDock = () => intents.setDock(nextLocation(dock))`; `setDock` accepts `null`. `dock-cycle.ts` is untouched apart from its header comment, which no longer claims to describe the file navigator.

## Implementation steps

1. Add `navigator-location.ts` with `nextLocation` and `locationTooltip`, and `navigator-location.test.ts` covering the full cycle and the three tooltips.
2. `useFileNavigatorIntents.ts`: widen `setDock` to `'left' | 'right' | null`.
3. `FileNavigatorHeader.tsx`: render the location button for every placement, titled `locationTooltip(nextLocation(dock))`.
4. `FileNavigatorTab.tsx`: always pass `onCycleDock`, using `nextLocation`; drop the `nextDock` import.
5. `web/src/shared/dock-cycle.ts`: correct the comment to say the left↔right toggle is for notifications, schedules, and plugin tabs, and that the file navigator has its own three-way cycle.

## Regression test

`web/src/file-navigator/FileNavigatorTab.test.tsx`:
- "location button in a center tab sends setDock to right" — renders a center navigator, asserts exactly one `.files-dock-cycle`, clicks "Move to right sidebar", asserts `setDock` with `dock: 'right'`. Replaces the old "dock-cycle button is hidden when the navigator is in a center tab", which pinned the bug.
- "location button from left sends the tree back to the center tab strip" — renders `dock="left"`, clicks "Move to center tab strip", asserts `setDock` with `dock: null`. Replaces "dock-cycle button from left sends setDock to right".
- "location button from right sends setDock to left" — unchanged behavior, renamed.

Both new cases fail against the unfixed code (0 buttons; no "Move to center tab strip" title).

## Verification

`./scripts/run.mjs check-diff`. Live: build the fixed checkout, start a scratch instance under `./temp/fix-a-bug/`, and rerun the Step 1 driver `./temp/fix-a-bug-drivers/verify.mjs` through `e2e-driver`. It runs `files`, records the center tree's header actions, clicks the location button up to four times recording placement and tooltip each step, then runs `files left` and clicks up to three more times. Expected: the center tree has one location button titled "Move to right sidebar", and the cycle visits right → left → center → right; from `files left` it visits center → right → left.

Result: verified live against the fixed build. The center tree's header now includes `files-dock-cycle` titled "Move to right sidebar"; four clicks moved it center → right → left → center → right, and from `files left` three clicks moved it left → center → right → left, each tooltip naming the next destination.

## Spec and docs

`product/specs/file-navigator-tab.md` already describes the correct behavior; no change. `sidebars.md` and `notifications.md` are unaffected. `help.md` does not mention the button. `documentation/user-documentation/tab-types/file-navigator.md` documents the old behavior in "Move a tree between the two sidebars" (a docked-only button that swaps sides; "A tree in the center tab strip has no such button") and in the mouse table row "Header ⇄ button | Swap sidebars … Only on a docked tree"; rewrite both to describe the three-way cycle on every tree.

## Out of scope

- The notifications, schedules, and docked plugin tabs' left↔right toggle (`nextDock`, `DockCycleHeader`), which their own specs describe.
- Any server-side docking change; `setDock(index, null)` already undocks.
- Header layout (`files-header--docked`) and the split button, which stay keyed to `dock`.
