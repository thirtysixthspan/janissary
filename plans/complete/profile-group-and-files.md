# Profile harness group authoring + profile-level file navigator

**Complexity: 4/10** — three small, independently-testable pieces, each following an existing
pattern in the codebase exactly (group authoring already exists for agent entries; profile-level
monitors already establish the "reserved `_<name>.json`, opened after every entry is up" pattern).
No new architecture, but it touches three files plus a brand-new sibling module.

## Goal

Fix `profiles/claude/claude.json` (a harness-only profile) landing in whatever the "next free"
group happens to be instead of group 1, even though its `_monitors.json` already declares
`targets: ["group:1"]` — so today the monitor almost never actually tracks the harness it ships
with. Also add a way for a profile to open a file-navigator tab (rooted at one of its own tabs'
cwd, docked into a sidebar) as part of launch, and use it in the `claude` profile per the issue:
launch the harness in group 1, monitor group 1 (already declared), and open a file navigator on
the claude workspace docked left.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Agent entries can already author a fixed group (`group?: number` on `AgentState`) | `src/types.ts:209` |
| The group is picked once per profile launch, threaded through both openers | `src/profile/agent-opener.ts:105-108`, `:41`, `:56` |
| `HarnessManager.openFromProfile` already accepts and honors an explicit `group`/`groupColor` | `src/harness/manager.ts:89-98` — **no change needed here** |
| Reserved-file pattern (`_monitors.json`) — loader + "run after every entry is open" wiring | `src/profiles.ts:65-86` (`loadProfileMonitors`), `src/profile/monitors.ts` (`startProfileMonitors`), called from `src/profile/agent-opener.ts:137` |
| `files` command's `in <label>`/`on <side>` clauses (just added) | `src/file-tree-manager.ts` `open()` / `parseArgs()` |
| Docked tabs are never active; docking while active reassigns focus automatically | `src/tab/manager.ts:166-189` (`setDock`, `activateNearestNonDocked`) — relied on, not modified |

## Part A — harness entries can author a group

1. **`src/types.ts`** (`ProfileHarnessEntry`, ~line 228-247): add `group?: number;` alongside
   `number?: number;`.

2. **`src/profile/agent-opener.ts`** (`openProfileEntries`, lines 105-108): simplify the
   authored-group lookup now that both union members carry `group?: number` — drop the
   harness-entry exclusion:
   ```ts
   const authoredGroup = entries
     .map((e) => e.group)
     .find((g): g is number => typeof g === 'number');
   ```
   `isHarnessEntry` stays (still used by `labelOf`/`closeMatchingTabs`/the open loop) — only this
   one `.map` callback changes.

3. **`profiles/claude/claude.json`**: add `"group": 1` to the existing object.

`_monitors.json` needs no change — `targets: ["group:1"]` is already correct; it just starts
actually matching the harness tab once the harness lands in group 1.

## Part B — profile-level file navigator (`_files.json`)

Mirrors the `_monitors.json` mechanism exactly: a reserved, `_`-prefixed file, loaded by a new
`src/profiles.ts` function, opened by a new sibling module after every profile entry is up.

4. **`src/types.ts`**: add, near `ProfileMonitor` (~line 255):
   ```ts
   // A profile-level file-tree tab, authored in a profile's reserved `_files.json` file
   // (mirrors `_monitors.json`). `dock` docks it into that sidebar; `in` roots it at the cwd of
   // the named tab instead of the profile's first newly opened tab.
   export type ProfileFilesEntry = { dock?: 'left' | 'right'; in?: string };
   ```

5. **`src/profiles.ts`**: add a loader mirroring `loadProfileMonitors` (lines 65-86):
   ```ts
   function isProfileFilesEntry(value: unknown): value is ProfileFilesEntry {
     if (typeof value !== 'object' || value === null) return false;
     const v = value as Record<string, unknown>;
     return (v.dock === undefined || v.dock === 'left' || v.dock === 'right')
       && (v.in === undefined || typeof v.in === 'string');
   }

   // Profile-level file-tree tabs live in a reserved `_files.json` file — a JSON array of
   // `{ dock?, in? }` — kept out of the entry set by the leading underscore. Returns [] when the
   // file is absent, unparseable, or not an array; malformed elements are dropped.
   export function loadProfileFiles(name: string): ProfileFilesEntry[] {
     const file = path.join(profilePath(name), '_files.json');
     if (!existsSync(file)) return [];
     try {
       const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
       return Array.isArray(parsed) ? parsed.filter(isProfileFilesEntry) : [];
     } catch {
       return [];
     }
   }
   ```
   Import `ProfileFilesEntry` alongside the existing `ProfileEntry, ProfileMonitor, ProfileParsed`
   type import at the top.

6. **New `src/profile/files.ts`**, mirroring `src/profile/monitors.ts`:
   ```ts
   import { loadProfileFiles } from '../profiles.js';
   import type { Managers } from '../managers.js';

   // Open each profile-level file-tree tab (from the profile's `_files.json`) once every entry is
   // open, rooted at `defaultLabel` (the profile's first newly opened tab) unless the entry names
   // its own `in` target. `defaultLabel` is undefined when the profile opened nothing, in which
   // case an entry with no `in` has nothing to root itself at and is skipped with a note.
   export function openProfileFiles(
     profileName: string, managers: Managers, defaultLabel: string | undefined, notes: string[],
   ): void {
     for (const entry of loadProfileFiles(profileName)) {
       const label = entry.in ?? defaultLabel;
       if (label === undefined) { notes.push('File navigator: no tab to root it at.'); continue; }
       const clauses = [entry.in ? `in ${entry.in}` : '', entry.dock ? `on ${entry.dock}` : ''].filter(Boolean).join(' ');
       managers.fileTree.open(`files ${clauses}`.trim(), label);
       notes.push(`Opened file navigator${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
     }
   }
   ```

7. **`src/profile/agent-opener.ts`**: import `openProfileFiles` from `./files.js`. After
   `if (opened.length > 0) managers.tab.setActiveTab(firstNew);` (line 134), add:
   ```ts
   const firstNewLabel = opened.length > 0 ? managers.tab.tabs[firstNew]?.label : undefined;
   openProfileFiles(name, managers, firstNewLabel, notes);
   ```
   before the existing `startProfileMonitors(...)` call, so the file tab (if any) is part of the
   tab list by the time monitor targets (e.g. `group:1`) resolve.

   Note: opening and then docking a file tab can move focus away from `firstNew` to the nearest
   non-docked tab (existing `setDock` behavior — docked tabs are never active) — this is the same
   invariant every other `files left`/`files right` call already relies on, not a new edge case
   introduced here.

8. **`profiles/claude/_files.json`** (new file):
   ```json
   [
     { "dock": "left" }
   ]
   ```
   No `in` — defaults to the profile's first newly opened tab, i.e. the `claude` harness tab, so
   the tree roots at its workspace cwd.

## Tests

- **`src/profiles.test.ts`**: add `loadProfileFiles` cases mirroring the existing
  `loadProfileMonitors` tests in the same file — returns `[]` when `_files.json` is absent, parses
  a valid array, drops malformed elements, returns `[]` on invalid JSON / a non-array top level.
- **New `src/profile/files.test.ts`**, mirroring `src/profile/monitors.test.ts`'s structure
  (`initProfileDir` into a temp dir, write `_files.json` directly, mock `managers.fileTree.open`):
  - opens a files tab at `defaultLabel` with no clauses when the entry has neither `dock` nor `in`.
  - builds `files on left` when only `dock` is set, called with `defaultLabel`.
  - builds `files in <label>` when only `in` is set, called with that label (not `defaultLabel`).
  - builds `files in <label> on <side>` when both are set.
  - skips with a note when `defaultLabel` is undefined and the entry has no `in`.
  - does nothing when the profile has no `_files.json`.
- **New `src/profile/agent-opener.test.ts`** (none exists yet) covering the two behaviors this
  plan changes, with a minimal mocked `Managers` (`tab`, `harness.openFromProfile`, `schedule.set`,
  `monitor.stop/start`, `fileTree.open`, following the mocking style in `manager.test.ts` /
  `monitors.test.ts`):
  - a harness entry with `group: 3` causes `managers.harness.openFromProfile` to be called with
    `group === 3` (not the next-free-group default).
  - without an authored group, the next-free-group default (`Math.max(...) + 1`) is still used
    (regression guard for the existing behavior).
  - `openProfileFiles` is invoked with the label of `tabs[firstNew]` after entries open (assert via
    a mocked `managers.fileTree.open` seeing the expected label when a temp profile dir has a
    `_files.json`).

Run `./scripts/run.mjs check-diff` after each implementation step and again once tests are added.

## Spec updates

**`specs/profiles.md`**:
- Add a `group` bullet to the harness-entry field list (~line 18, after `offline`): "**group** — an
  explicit group number for the whole profile (see below), same as an agent entry's `group`."
- Update line 44 ("the next free group number, or a group number authored on one of the profile's
  agent files") to say "...authored on any of the profile's entries" (harness entries can author
  it too now).
- Add a new subsection after "Profile-level monitors" documenting `_files.json`: a reserved file,
  JSON array of `{ dock?, in? }`, opened as `files [in <in>] [on <dock>]` once every entry is up,
  defaulting `in` to the profile's first newly opened tab. Note that a docked tree is never the
  active tab, so opening one can shift focus away from the first newly opened tab to the nearest
  non-docked tab — the same invariant `files left`/`files right` already has.

No other spec files need updates — `specs/file-tree-tab.md` already documents the `files` command
forms this reuses verbatim.

## Out of scope

- Any change to `HarnessManager.openFromProfile` or `spawnTab` — they already accept and honor an
  explicit group.
- Any change to `FileTreeManager` itself — `_files.json` only composes the command string already
  supported.
- Multiple monitors/files entries interacting with each other's groups, or a profile referencing
  another profile's tabs — not requested and not implied by the issue.
