# Dragging a file navigator row into a harness tab types its path into the harness

**Complexity: 4/10** — one new shared registry module, one registration effect and one DOM marker on the harness tab, one hovered-target branch in the file navigator's drag hook, plus tests, spec, and documentation. No new architecture, no wire-protocol change, and no change to any existing drop destination.

A file-navigator drag already has two destinations besides the tree itself: the command bar of the active tab (`[data-command-bar]`, paths joined by single spaces and resolved against the active tab's working directory) and an active editor tab (`[data-editor-drop]`, tree-relative paths joined by newlines, inserted at the cursor). A harness tab is neither. Its body is a live PTY, so a drag released over it today falls through to the tree-move path, finds no row under the pointer, and does nothing at all.

That is the gap the issue names: a harness is the one tab where a path is most often what you are about to type, and the only way to get one there is to read it off the tree and retype it.

## Goal

Releasing a file-navigator drag over a harness tab's terminal writes the dragged paths into that harness's PTY, exactly as if they had been typed, and moves keyboard focus to the terminal. Nothing is submitted, and nothing moves on disk.

## Design decisions

**Paths take the command bar's form, not the editor's.** A harness terminal is a command line, so the separator has to be a single space: newlines would submit each path but the last to the harness as a command. The path form follows for the same reason — `joinCommandPaths` already resolves each path against the target tab's working directory, and `targetCwd` reaching the navigator is the active tab's `cwd`, which *is* the harness's cwd whenever a harness is the active tab. A remote tree keeps inserting `<host>:<absolute-remote-path>`, which is what both existing destinations do; a third rule for the same gesture would be harder to describe than it is worth.

**The drop target is published through a registry keyed by PTY id, not a shared active-tab ref.** The command bar and the editor each publish a handle into one ref that the currently active tab claims during render — workable there because at most one of each is ever visible. Harness tabs are different: every one of them stays mounted, and split panes can leave two visible at once, so "whichever one is active" would deliver the drop to the wrong terminal. Each mounted harness registers its own handle under its PTY id, and the drag reads the id straight off the element under the pointer, which is by construction the harness the user is dropping onto. This mirrors `web/src/file-navigator-selection-registry.ts`, the app's existing answer to "many mounted instances publish something the app needs to read back."

**The registry lives beside `drop-handles.ts`, at the web root.** `web/src/file-navigator/` and `web/src/harness/` are sibling features and may not import one another (`import-x/no-restricted-paths`, `ai/guidelines/react-code-organization.md` §3). The existing drop contracts already sit at the web root for exactly this reason; the registry that publishes one belongs there too. The type module stays type-only — the registry's state goes in its own module rather than into `drop-handles.ts`, which many files import.

**Registration returns its own unregister function**, matching `attachPty`/`onState`/`registerStateCollector` and every other subscription on the client, so the harness tab's effect can return it directly.

**No highlight while the drag is over a harness**, matching the editor. The command bar highlights because it is a thin strip that is easy to miss; a full-tab terminal is not.

**Focus moves to the terminal on drop**, for the reason the editor does the same: the drag started in the file tree, where the next letters typed are a type-to-select gesture rather than text.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Pointer-target lookup during a drag (`hovered`) | `web/src/file-navigator/useFileNavigatorDrag.ts` |
| Command-bar and editor drop branches to mirror | `web/src/file-navigator/useFileNavigatorDrag.ts` (`drop`, `onWindowMove`) |
| Space-joined, cwd-relative / host-qualified path text | `joinCommandPaths` in `web/src/file-navigator/file-navigator-relative-path.ts` |
| The drop-handle contracts | `web/src/drop-handles.ts` |
| A module-level registry many mounted instances publish into | `web/src/file-navigator-selection-registry.ts` |
| Terminal focus and the PTY write path | `useXterm`'s returned `focus`; `ptyInput` RPC (`src/protocol/core-rpc.ts`) |

## Implementation steps

1. **`web/src/drop-handles.ts`: add `HarnessDropHandle`.** `{ insertAtCaret: (text: string) => void }`, with a comment recording that it is published through the PTY-id registry rather than a single active-tab ref, and why.

2. **New module `web/src/harness-drop-registry.ts`.** A module-level `Map<string, HarnessDropHandle>` keyed by PTY id, with `registerHarnessDrop(ptyId, handle)` returning an unregister function, and `harnessDropHandle(ptyId)` returning the handle or `undefined`.

3. **`web/src/harness/HarnessTab.tsx`: publish the target.** Mark the terminal body with `data-harness-drop={harness.ptyId || undefined}` so a provisioning tab with no PTY yet is not a target, and register a handle in an effect keyed on the PTY id: it focuses the terminal, then sends `ptyInput` with the dropped text. The effect returns the unregister function.

4. **`web/src/file-navigator/useFileNavigatorDrag.ts`: recognize and deliver.** Track the hovered harness's PTY id in a ref beside `overCommandBarRef`/`overEditorRef`, cleared by `resetGestureState`. In `onWindowMove`, read it from the `[data-harness-drop]` element under the pointer (only when the pointer is over neither the command bar nor an editor) and suppress the row drop-target highlight while it is set. In `drop`, after the command-bar and editor branches, hand `joinCommandPaths(absoluteRoot, gesture.sourcePaths, targetCwd, remoteHost)` to the registered handle and return without touching the tree.

## Tests

- `web/src/harness-drop-registry.test.ts` (new) — a registered handle is returned by its PTY id; an unknown id returns `undefined`; the returned function unregisters; registering the same id twice replaces the first handle.
- `web/src/harness/HarnessTab.test.tsx` — the terminal body carries `data-harness-drop` with the tab's PTY id; a running harness registers a handle under that id; the handle sends `ptyInput` with the dropped text and focuses the terminal; unmounting unregisters; a provisioning harness (empty PTY id) renders no marker and registers nothing.
- `web/src/file-navigator/useFileNavigatorDrag.test.ts` — a drag released over the harness marker calls the registered handle with the space-joined, cwd-relative text and sends no `moveFileNavigatorItem`; a remote tree inserts `<host>:<absolute-remote-path>`; hovering the marker suppresses the row drop-target highlight; a release over a harness whose PTY has no registered handle changes nothing; a release over a tree row still moves the file as before.
- `web/src/drop-handles.test.ts` — `HarnessDropHandle` accepts an insert-only handle, mirroring the editor case.

## Out of scope

- **The interactive-PTY takeover tab (`ShellTab`) and inline terminal cards.** They are terminals too, but the issue names the harness tab, and each would need its own marker and registration decision.
- **Highlighting the harness body during a drag**, or any other new drag affordance.
- **Quoting or escaping inserted paths.** Both existing destinations insert exactly what they computed, spaces and all; this one matches.
- **Changing what a remote tree inserts** into any destination.
- **Reworking `useFileNavigatorDrag`'s positional-argument signature**, or extracting its three external-destination branches into a module of their own. Worth doing — the file is close to the 200-line limit — but it is a refactor of existing behavior, not this fix.
