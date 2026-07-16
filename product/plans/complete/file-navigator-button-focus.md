# Metadata-row file button should not steal tab focus

**Complexity: 3/10** — the bug is a single stale-read in `openOrRetarget`'s final focus
assignment; the fix is to always re-focus the originating tab explicitly instead of reading
`cur().label` after a docking side effect has already moved it.

## Goal

Clicking the 📁 file button in a tab's metadata row opens (or retargets) the file navigator in
the sidebar, but keeps keyboard/command focus on the tab whose button was clicked — not on the
file navigator, and not on whatever tab happens to be first in the strip.

## Root cause

`openOrRetarget` (`src/file-tree-open.ts:20-31`) ends with:
```ts
const focusLabel = existing ?? port.managers.tab.cur().label;
port.managers.tab.setActiveTab(port.managers.tab.findIndex(focusLabel));
```
The intent (per its own doc comment, "Either way, focus the resulting file-tree tab") was to
land focus on the file-tree tab. But in the fresh-open branch (`openFresh`, `:35-43`), the last
step is `setDock(..., 'left')`. `TabManager.setDock` → `applyDock` (`src/tab/dock.ts:11-30`)
docks the tab and, if it was the active tab, immediately reassigns `activeTab` to the
**nearest non-docked tab** (`nearestNonDocked`, `:32-39`) — a docked tab can never stay active.
Since the fresh file tab is inserted at the start of the strip (`insertTabInGroup(..., 'start')`
in `addFilesTab`), the "nearest non-docked tab" found by that search is effectively **the first
non-docked tab in the strip**, not the tab that triggered the button.

By the time `openOrRetarget` reads `port.managers.tab.cur().label` after `openFresh` returns,
that reassignment has already happened — so `focusLabel` resolves to whatever tab
`nearestNonDocked` landed on, and the subsequent `setActiveTab` call is a no-op confirming that
same wrong tab (a docked tab can never become active, so even if `focusLabel` had correctly been
the file-tree tab, `setActiveTab` would have silently refused to focus it — see the guard at
`src/tab/manager.ts:175`, `if (this.tabs[index]?.dock) return;`).

`openOrRetarget` is called from exactly one place: `openFileNavigatorFor`
(`src/controller-file-tree.ts:41-43`), which only backs the metadata-row 📁 button — it is not
shared with the `files` command's own open flow (`FileTreeManager.open()`,
`src/file-tree-manager.ts:40-87`), so changing its focus behavior cannot affect `files`.

## Approach

Stop trying to (re)compute which tab ended up focused after the open/retarget side effects run.
Always end by explicitly focusing the tab that was passed in — `label`, the tab whose button was
clicked. That is also the desired end state per the issue, so no branching on `existing` is
needed for the focus decision.

## Implementation steps

1. **`src/file-tree-open.ts`** — replace the trailing focus logic:
   ```ts
   export function openOrRetarget(port: OpenPort, label: string): void {
     const cwd = port.managers.tab.cwdOf(label) ?? process.cwd();
     let stat;
     try { stat = statSync(cwd); } catch { stat = undefined; }
     if (!stat?.isDirectory()) return;

     const existing = port.managers.tab.mostRecentFileTreeLabel();
     if (existing) retarget(port, existing, cwd);
     else openFresh(port, cwd);
     port.managers.tab.setActiveTab(port.managers.tab.findIndex(label));
   }
   ```
   Update the function's doc comment: replace "Either way, focus the resulting file-tree tab."
   with "Either way, focus stays on the tab whose button was clicked — opening or retargeting the
   navigator must not steal focus."
2. **`src/file-tree-manager.ts:130-133`** — update `openOrRetarget`'s wrapper doc comment to match
   (same focus behavior described there).

## Tests

- **`src/file-tree-manager.test.ts`** — update the existing test at `:574` ("opens a fresh,
  left-docked tree ... and focuses it when none exists") to assert the new behavior instead:
  rename it to reflect that focus stays on the originating tab, and trigger it from a non-first
  tab (`activeTab = 1` / label `'other'`) so the assertion actually exercises the fix rather than
  a coincidental match with index 0:
  ```ts
  it('openOrRetarget opens a fresh, left-docked tree at the tab cwd but leaves the originating tab focused', () => {
    const manager = run();
    activeTab = 1; // simulate clicking the button from "other", not the first tab
    manager.openOrRetarget('other');
    const nav = tabs.find((t) => t.files);
    expect(nav).toBeDefined();
    expect(nav!.files!.root).toBe(otherRoot);
    expect(nav!.dock).toBe('left');
    expect(tabs[activeTab].label).toBe('other');
  });
  ```
- Add a case for the retarget branch (navigator already open) confirming focus lands back on the
  clicking tab rather than the navigator:
  ```ts
  it('openOrRetarget leaves the originating tab focused when retargeting an existing navigator', () => {
    const manager = run();
    manager.openOrRetarget('janus');
    activeTab = 1; // simulate the button now being clicked from "other"
    manager.openOrRetarget('other');
    expect(tabs[activeTab].label).toBe('other');
  });
  ```

## Out of scope

- The `files` command's own focus behavior (`FileTreeManager.open()`) — unaffected, separate
  code path, not mentioned by the issue.
- `setActiveTab`'s docked-tab guard and `applyDock`'s `nearestNonDocked` fallback — both remain
  correct and useful for their actual purpose (e.g. `closeTab`/`reorderTab` landing on a docked
  tab); this fix simply stops depending on their side effects to determine focus.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected server tests.
- Manual: not practical to click the UI button in this environment; covered by the updated and
  new unit tests above instead.
