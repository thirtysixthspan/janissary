# File navigator button on the harness/agent tab metadata row

**Complexity: 4/10** — client button + one new protocol message + one new server operation; correctness depends on two real gaps found in the existing focus-tracking and reroot mechanisms (see decisions 2 and 3), not just wiring an existing mechanism through.

## Summary

A new button, right-floated in the metadata row of harness tabs and agent tabs (`AgentTabMeta`), opens a file navigator rooted at that tab's own working directory. If a file navigator is already open somewhere in the app, clicking the button retargets that existing navigator to the clicked tab's cwd instead of opening a second one; if none is open yet, a fresh one opens docked into the left sidebar by default. This gives a one-click way to inspect "what's in this tab's directory" without typing `files in <label>`.

## Design decisions

1. **Scope: harness and agent tabs only.** The button is added to `AgentTabMeta`, which today renders in `HarnessTab.tsx`, `ShellTab.tsx`, and `AgentTabBody.tsx`. Per the feature's own wording ("harness/agent tabs"), the button is shown for harness tabs and agent tabs, but not shell (PTY-takeover) tabs — `AgentTabMeta` gains a prop to control whether the button renders, defaulting to off, explicitly enabled only from `HarnessTab.tsx` and `AgentTabBody.tsx`.
2. **Which navigator "is open."** If more than one file-tree tab is already open, the button retargets whichever one was most recently focused. `TabManager.focusHistory` (`src/tab/manager.ts:33`) records this, but it is `private`, and its only existing accessor, `popFocusHistory()` (`:158-165`), is the wrong tool here: it **mutates** the stack (destructively `pop()`s) and it deliberately **skips docked tabs** (`!this.tabs[index].dock`, since it exists solely to restore focus to a normal center-strip tab after a close). A docked file-tree tab is a valid, expected retarget target for this button (decision 4 preserves dock placement), so a docked entry must not be skipped. `TabManager` needs a new, separate, non-destructive method (e.g. `mostRecentFileTreeLabel(): string | undefined`) that scans `focusHistory` from most-recent to least-recent for a still-open tab with `view === 'files'`, without popping and without excluding docked tabs. If the scan finds nothing (e.g. a file-tree tab exists but never lost focus since opening, however unlikely once this button's own flow is the only caller triggering a switch away from it), fall back to the first `view === 'files'` tab in `tabs` order; if still none, no navigator is open. If none is currently open, a new one is created.
3. **Retargeting is a new operation, not open-dedup-by-root.** Today `files`/`files in <label>` dedups by root path — a different root always gets its own tab. This button instead needs to change an *existing* tab's root outright, which today's `open()` path in `FileTreeManager` doesn't do. A new dedicated operation retargets an existing file-tree tab's root in place — the tab's identity, dock placement, and position in the strip are preserved. It reuses `reroot()`'s (`src/file-tree-manager.ts:114-126`) clear-expanded/unwatch/rewatch/rebuild sequence, generalized to accept an arbitrary absolute directory instead of only a relative move from the current root — but **unlike** `reroot()`, which clears neither `state.undoStack` nor `state.redoStack` (verified: `reroot()` only clears `expanded` and watchers), the new retarget operation also clears both stacks. This is a deliberate departure from `reroot()`'s precedent: `reroot()` only ever moves to a parent directory (`..`), where old undo/redo entries plausibly still resolve to real paths, but retargeting jumps to a wholly unrelated directory, where an old stack entry's relative path no longer means anything meaningful at the new root.
4. **Default dock on first open.** When no navigator exists yet, the new one opens docked in the left sidebar — a different default than the bare `files` command (which opens into the center tab strip unless `left`/`right` is given).
5. **Focus.** Clicking the button — whether it opens a fresh navigator or retargets an existing one — moves focus to that file-tree tab, matching how the `files` command already focuses the tab it creates or finds.
6. **Wording.** The button shows a folder glyph (📁), with a tooltip reading "Open file navigator here", following the same single-glyph-plus-tooltip convention as the file tree tab's own dock-cycle button.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `AgentTabMeta` | `web/src/AgentTabMeta.tsx` | The shared metadata-row component already rendered by `HarnessTab.tsx`, `ShellTab.tsx`, and `AgentTabBody.tsx` (per the recent refactor reusing it across harness/shell tabs) — the button is added here, gated by a new prop. |
| File tree tab header buttons | `web/src/FileTreeTab.tsx` (`files-actions`, dock-cycle button) | Direct visual/interaction precedent: a right-aligned action button in a tab's header dispatching a dedicated RPC (`client.send({ method: 'setDock', ... })`) rather than typed command text. |
| `FileTreeManager.open` / `reroot` | `src/file-tree-manager.ts:57-88,114-126` | `open()` shows the existing root-dedup-and-focus logic; `reroot()` shows the "clear expanded set, unwatch, re-watch, rebuild" sequence the new retarget operation reuses — but note decision 3: `reroot()` does not clear `undoStack`/`redoStack`, and the new operation deliberately does, unlike this precedent. |
| `TabManager.focusHistory` | `src/tab/manager.ts:33,148-165` | The existing most-recently-focused stack, but its only accessor (`popFocusHistory`) mutates and excludes docked tabs — wrong for this use (decision 2). A new, separate, non-mutating, dock-inclusive method is needed alongside it, not a direct reuse. |
| `parseFileTreeArgs` / `resolveTarget` | `src/file-tree-args.ts`, `src/commands/resolve-target.ts` | Existing helpers for resolving a named tab's cwd (`files in <label>`); reused to compute the clicked tab's cwd rather than reimplementing tab lookup. |
| `messageBus.emit('state', { type: 'dirty' })` | `src/file-tree-manager.ts` | The existing dirty-state signal already used after any tree mutation; the new retarget operation re-renders through the same path. |

## Proposed changes

1. **`web/src/AgentTabMeta.tsx`**: add an optional prop (e.g. `onOpenFileNavigator?: () => void`) that, when provided, renders a right-floated button (📁, tooltip "Open file navigator here") dispatching a new client message when clicked.
2. **`web/src/HarnessTab.tsx`, `web/src/AgentTabBody.tsx`**: pass the new prop into `AgentTabMeta`, wiring it to send a new RPC identifying the tab whose cwd should be shown (e.g. by the tab's own label, resolved server-side the same way `files in <label>` already resolves a named tab's cwd). `web/src/ShellTab.tsx` does not pass the prop, per decision 1.
3. **New protocol message** (e.g. `openFileNavigatorFor` or similar, in `src/protocol.ts` alongside the existing file-tree messages): server-side, handled in `FileTreeManager`, taking the requesting tab's label.
4. **`src/tab/manager.ts`**: add a new public method (e.g. `mostRecentFileTreeLabel(): string | undefined`, per decision 2) that non-destructively scans `focusHistory` from the end for the first still-open tab with `view === 'files'` (docked or not), falling back to the first `view === 'files'` tab in `tabs` order if the scan finds none. `popFocusHistory` and its existing callers are untouched.
5. **`src/file-tree-manager.ts`**: new method (e.g. `openOrRetarget(label: string)`) that resolves the named tab's cwd, then: calls the new `mostRecentFileTreeLabel()` (item 4); if it returns a label, retargets that tab to the new root using a generalized version of the existing `reroot()` clearing logic (accepting an arbitrary absolute path rather than only a relative move, and additionally clearing `undoStack`/`redoStack` per decision 3); if it returns `undefined`, opens a fresh tree exactly as `open()` does for a bare `files` command, but docked left by default instead of centered. Either branch ends by focusing the resulting file-tree tab.
6. **Spec updates**: `product/specs/tabs.md`'s metadata row section gains a line describing the new button; `product/specs/file-tree-tab.md` gains a short note on the retarget operation and its left-sidebar-by-default behavior when triggered from this button (distinguishing it from the bare `files` command's center-strip default).

## Tests

- `web/src/AgentTabMeta.test.tsx`: the button renders only when the new prop is passed; clicking it invokes the callback; the button is absent when the prop is omitted (covering the `ShellTab` case).
- `web/src/HarnessTab.test.tsx` / `web/src/AgentTabBody.test.tsx` (or equivalent): clicking the metadata row's file-navigator button dispatches the new RPC with the tab's own label.
- `src/tab/manager.test.ts`: `mostRecentFileTreeLabel` returns the most-recently-left tab's label when it has `view === 'files'`; returns a **docked** file-tree tab's label rather than skipping it (the key behavior difference from `popFocusHistory`); does not mutate `focusHistory` (calling it twice returns the same result); falls back to the first `view === 'files'` tab in `tabs` order when the history scan finds none; returns `undefined` when no file-tree tab exists at all.
- `src/file-tree-manager.test.ts`: `openOrRetarget` opens a fresh, left-docked tree and focuses it when none exists; retargets the tab `mostRecentFileTreeLabel` names to the new root, preserving its dock placement and tab position, when one exists; clears the retargeted tab's expanded set, watchers, **and undo/redo stacks** for the old root (the last of which `reroot()` itself does not do, per decision 3).

## Out of scope

- Any change to the bare `files [left|right] [path]` command's own dedup-by-root or center-strip-default behavior — those are untouched; the new left-sidebar default and retarget behavior are specific to this button.
- Adding the button to shell (PTY-takeover) tabs.
- Any change to `reroot()`'s existing relative (`..`) navigation behavior.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: with no file-tree tab open, click the new button on a harness tab and confirm a navigator opens docked in the left sidebar, rooted at that tab's cwd, and focus moves to it. Click the button again from a different harness/agent tab with a different cwd and confirm the same navigator's root changes (rather than a second tab opening) and its dock placement is unchanged. Open a second file-tree tab manually via the `files` command on a third root, focus it, then click the metadata button from a tab again and confirm the most-recently-focused tree (the manually opened one) is the one retargeted.
