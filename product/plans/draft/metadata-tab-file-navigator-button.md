# File navigator button on the harness/agent tab metadata row

## Summary

A new button, right-floated in the metadata row of harness tabs and agent tabs (`AgentTabMeta`), opens a file navigator rooted at that tab's own working directory. If a file navigator is already open somewhere in the app, clicking the button retargets that existing navigator to the clicked tab's cwd instead of opening a second one; if none is open yet, a fresh one opens docked into the left sidebar by default. This gives a one-click way to inspect "what's in this tab's directory" without typing `files in <label>`.

## Design decisions

1. **Scope: harness and agent tabs only.** The button is added to `AgentTabMeta`, which today renders in `HarnessTab.tsx`, `ShellTab.tsx`, and `AgentTabBody.tsx`. Per the feature's own wording ("harness/agent tabs"), the button is shown for harness tabs and agent tabs, but not shell (PTY-takeover) tabs — `AgentTabMeta` gains a prop to control whether the button renders, defaulting to off, explicitly enabled only from `HarnessTab.tsx` and `AgentTabBody.tsx`.
2. **Which navigator "is open."** If more than one file-tree tab is already open, the button retargets whichever one was most recently focused (tracked via the tab manager's existing focus-history stack), not necessarily the first-ever-opened `navigator` tab or an arbitrary one. If none is currently open, a new one is created.
3. **Retargeting is a new operation, not open-dedup-by-root.** Today `files`/`files in <label>` dedups by root path — a different root always gets its own tab. This button instead needs to change an *existing* tab's root outright, which today's `open()` path in `FileTreeManager` doesn't do. A new dedicated operation retargets an existing file-tree tab's root in place (clearing its expanded set, watchers, and undo/redo history for the old root, exactly like the existing `reroot()` method already does for `..` navigation) — the tab's identity, dock placement, and position in the strip are preserved. This is distinct from opening a fresh tab and mirrors `reroot()`'s existing clear-and-rebuild shape, generalized to accept an arbitrary absolute directory instead of only a relative move from the current root.
4. **Default dock on first open.** When no navigator exists yet, the new one opens docked in the left sidebar — a different default than the bare `files` command (which opens into the center tab strip unless `left`/`right` is given).
5. **Focus.** Clicking the button — whether it opens a fresh navigator or retargets an existing one — moves focus to that file-tree tab, matching how the `files` command already focuses the tab it creates or finds.
6. **Wording.** The button shows a folder glyph (📁), with a tooltip reading "Open file navigator here", following the same single-glyph-plus-tooltip convention as the file tree tab's own dock-cycle button.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `AgentTabMeta` | `web/src/AgentTabMeta.tsx` | The shared metadata-row component already rendered by `HarnessTab.tsx`, `ShellTab.tsx`, and `AgentTabBody.tsx` (per the recent refactor reusing it across harness/shell tabs) — the button is added here, gated by a new prop. |
| File tree tab header buttons | `web/src/FileTreeTab.tsx` (`files-actions`, dock-cycle button) | Direct visual/interaction precedent: a right-aligned action button in a tab's header dispatching a dedicated RPC (`client.send({ method: 'setDock', ... })`) rather than typed command text. |
| `FileTreeManager.open` / `reroot` | `src/file-tree-manager.ts` | `open()` shows the existing root-dedup-and-focus logic; `reroot()` shows the exact "clear expanded set, unwatch, re-watch, rebuild" sequence the new retarget operation reuses, generalized from a relative parent/child move to an arbitrary absolute target directory. |
| `TabManager.focusHistory` | `src/tab/manager.ts` | The existing most-recently-focused stack (already used to restore focus on `close`) is reused to determine which open file-tree tab counts as "the" navigator when more than one exists. |
| `parseFileTreeArgs` / `resolveTarget` | `src/file-tree-args.ts`, `src/commands/resolve-target.ts` | Existing helpers for resolving a named tab's cwd (`files in <label>`); reused to compute the clicked tab's cwd rather than reimplementing tab lookup. |
| `messageBus.emit('state', { type: 'dirty' })` | `src/file-tree-manager.ts` | The existing dirty-state signal already used after any tree mutation; the new retarget operation re-renders through the same path. |

## Proposed changes

1. **`web/src/AgentTabMeta.tsx`**: add an optional prop (e.g. `onOpenFileNavigator?: () => void`) that, when provided, renders a right-floated button (📁, tooltip "Open file navigator here") dispatching a new client message when clicked.
2. **`web/src/HarnessTab.tsx`, `web/src/AgentTabBody.tsx`**: pass the new prop into `AgentTabMeta`, wiring it to send a new RPC identifying the tab whose cwd should be shown (e.g. by the tab's own label, resolved server-side the same way `files in <label>` already resolves a named tab's cwd). `web/src/ShellTab.tsx` does not pass the prop, per decision 1.
3. **New protocol message** (e.g. `openFileNavigatorFor` or similar, in `src/protocol.ts` alongside the existing file-tree messages): server-side, handled in `FileTreeManager`, taking the requesting tab's label.
4. **`src/file-tree-manager.ts`**: new method (e.g. `openOrRetarget(label: string)`) that resolves the named tab's cwd, then: if any file-tree tab is currently open, picks the most-recently-focused one (via the tab manager's focus history) and retargets it to the new root using a generalized version of the existing `reroot()` clearing logic (accepting an arbitrary absolute path rather than only a relative move); if none is open, opens a fresh tree exactly as `open()` does for a bare `files` command, but docked left by default instead of centered. Either branch ends by focusing the resulting file-tree tab.
5. **Spec updates**: `product/specs/tabs.md`'s metadata row section gains a line describing the new button; `product/specs/file-tree-tab.md` gains a short note on the retarget operation and its left-sidebar-by-default behavior when triggered from this button (distinguishing it from the bare `files` command's center-strip default).

## Tests

- `web/src/AgentTabMeta.test.tsx`: the button renders only when the new prop is passed; clicking it invokes the callback; the button is absent when the prop is omitted (covering the `ShellTab` case).
- `web/src/HarnessTab.test.tsx` / `web/src/AgentTabBody.test.tsx` (or equivalent): clicking the metadata row's file-navigator button dispatches the new RPC with the tab's own label.
- `src/file-tree-manager.test.ts`: `openOrRetarget` opens a fresh, left-docked tree and focuses it when none exists; retargets the most-recently-focused existing file-tree tab (by focus history) to the new root, preserving its dock placement and tab position, when one or more already exist; clears the retargeted tab's expanded set and watchers for the old root.

## Out of scope

- Any change to the bare `files [left|right] [path]` command's own dedup-by-root or center-strip-default behavior — those are untouched; the new left-sidebar default and retarget behavior are specific to this button.
- Adding the button to shell (PTY-takeover) tabs.
- Any change to `reroot()`'s existing relative (`..`) navigation behavior.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: with no file-tree tab open, click the new button on a harness tab and confirm a navigator opens docked in the left sidebar, rooted at that tab's cwd, and focus moves to it. Click the button again from a different harness/agent tab with a different cwd and confirm the same navigator's root changes (rather than a second tab opening) and its dock placement is unchanged. Open a second file-tree tab manually via the `files` command on a third root, focus it, then click the metadata button from a tab again and confirm the most-recently-focused tree (the manually opened one) is the one retargeted.
