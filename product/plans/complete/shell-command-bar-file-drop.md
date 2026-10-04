# Drop file-navigator paths into the shell tab's command bar

**Complexity: 5/10** — A file-navigator drag recognizes any command bar under the pointer, but always inserts into the single drop handle the agent tab's command input publishes. Over a shell tab that handle belongs to a hidden agent bar, so the shell bar is never highlighted and never receives the path. The fix lets a command bar publish its own drop handle and makes the drag use the bar it is actually over.

## Goal

Dragging files from the file navigator onto a shell tab's command bar highlights that bar and, on release, inserts the dropped paths at its caret exactly as the agent tab's bar does, in the centre or docked.

## Approach

Add a command-bar drop registry keyed by the bar's own root element, beside the existing editor and harness registries. `CommandBarShell` takes an opt-in `acceptsFileDrops` prop; when set it registers a handle that splices text into its textarea and toggles the bar's `drop-target` class. A small `command-bar-drop-target` module tracks which bar the drag is over, resolves that bar's registered handle with the agent bar's `dropRef` as the fallback, moves the highlight between bars, and inserts on release. The shell tab opts in.

## Implementation

1. Add `registerCommandBarDrop` and `commandBarDropHandle` to the drop registry.
2. Add the `acceptsFileDrops` prop to `CommandBarShell` and register its handle while mounted, through a `useCommandBarDrop` hook beside it.
3. Add the `command-bar-drop-target` module and use it from `useFileNavigatorDrag` in place of the direct `dropRef` calls.
4. Pass `acceptsFileDrops` from the shell tab's command bar.
5. Update the shell-tab spec and the file-navigator user documentation where it describes dropping onto the command bar.

## Tests

- The drop target resolves a registered bar's handle, falls back to `dropRef` for an unregistered bar, moves the highlight from one bar to another, and inserts into the bar under the pointer.
- `CommandBarShell` with `acceptsFileDrops` registers a handle that inserts at its caret and highlights the bar, and unregisters on unmount.
- A drag released over a registered bar inserts there rather than through `dropRef`.

## Out of scope

- Opting other plugin command bars into drops.
- Changing the inserted path format, which stays the one the agent tab's bar receives.
