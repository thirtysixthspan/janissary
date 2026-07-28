# Respect each profile entry's authored group on launch

**Complexity: 6/10** — no new data model or abstractions (`group` already exists on every entry
and editor, `insertTabInGroup`/`renumberTabs` already exist), but the fix touches three call
sites (agent entries, harness entries via an existing correct path, and editor tabs via a path
that currently derives its group from whichever tab happens to be active) and has to keep the
existing "one shared default group" behavior working for every entry that authors no group.

## Goal

`product/backlog/issues.md`: "on profile launch, the harness and editor tabs should respect group
id." Today, `profiles.md` documents (and `openProfileEntries` in `src/profile/agent-opener.ts`
implements) that **all** of a launched profile's entries land in a single new group, picking at
most one authored `group` value from the whole entry list and applying it to everything —
individual entries' and editors' own `tab.group` values are otherwise ignored. Fix: each agent,
harness, and editor tab joins the group its own `tab.group` authors, when set; any entry/editor
that authors no group falls back to sharing one default new group, exactly as today.

## Design decisions

**Per-entry group resolution, single default fallback.** Replace the single `group`/`groupColor`
computed once for the whole launch with: `defaultGroup` (the next free group number, computed
once, unchanged from today's fallback formula) and, per entry, `group = entry.group ?? defaultGroup`.
This keeps the common case (no entry authors a group) byte-for-byte identical to today.

**Group color follows the group, not the launch.** Currently one `groupColor` (the first opened
entry's dot color) is stamped on every tab in the launch. With multiple groups possible in one
launch, each group needs its own color. A small helper resolves it per group: reuse the color of
a tab already on screen in that group (covers joining a pre-existing group), else fall back to
the entry's own dot color (the first tab landing in a brand-new group anchors that group's color,
matching today's behavior for the single-group case).

**Agent entries must use `insertTabInGroup`, not a raw array append.** `openAgentEntry` currently
does `managers.tab.tabs = [...managers.tab.tabs, tab]`. That was harmless when every launch used
one brand-new group (append-to-end and "insert into that group" are the same position), but once
an entry can join an *existing* group that isn't at the end of the tab strip (e.g. group 1, same
as the issuing tab), a raw append would break that group's contiguity. Harness entries already go
through `HarnessManager.openFromProfile` → `insertTabInGroup`, so only the agent path needs this
change.

**Editor tabs: override the inherited group after creation.** `openFile.edit` (via
`addEditorTab`) derives a new editor tab's group from whichever tab is currently active in the
`TabManager` — it has no `group` parameter. Threading an explicit group through the general
`edit`/`openEditorTab` stack (also used by the interactive `edit` command) is out of proportion to
this fix. Instead, `openProfileEditors` computes the editor's intended group
(`entry.tab?.group ?? defaultGroup`) and, only when the tab `edit` actually created lands in a
different group than that, moves it: pull it out of the tabs array and reinsert with
`insertTabInGroup` under the corrected `group`/`groupColor`, then re-`setActiveTab` to its new
index. An editor that reuses an already-open tab (no new tab created) is left untouched, since
there is nothing to move.

**Reorder pass runs per group.** The existing post-open reorder-by-`number` pass
(`reorderGroupByNumber`) only touches tabs whose `group` matches one target group. With multiple
groups now possible in a single launch, collect the distinct groups actually used by this
launch's candidates and run the pass once per group, instead of once for a single shared group.

## Implementation

1. **`src/profile/agent-opener.ts`**:
   - Replace `authoredGroup`/`group` computation with `defaultGroup` only (same fallback formula).
   - Add `colorForGroup(group, fallbackDotColor)`: `managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallbackDotColor`.
   - In the entry loop, compute `group = typeof entry.group === 'number' ? entry.group : defaultGroup` and `groupColor = colorForGroup(group, dotColor)` per entry (replacing the single `groupColor ??= dotColor` line).
   - Pass `defaultGroup` and `colorForGroup` through to `openProfileEditors`.
   - After building `candidates` and the `numbers` map, look up each candidate's actual current group (via `managers.tab.findIndex`) into a `Set<number>`, and call `reorderGroupByNumber` once per group in that set instead of once for the old single `group` value.
   - Import `insertTabInGroup` is not needed here (only in `entry-openers.ts`/`editors.ts`).

2. **`src/profile/entry-openers.ts`**:
   - Import `insertTabInGroup` from `../tab/index.js`.
   - `openAgentEntry`: replace `managers.tab.tabs = [...managers.tab.tabs, tab]` with `managers.tab.tabs = insertTabInGroup(managers.tab.tabs, tab)`.
   - `openHarnessEntry`: unchanged — `HarnessManager.openFromProfile` already inserts via `insertTabInGroup` with the `group`/`groupColor` it's given.

3. **`src/profile/editors.ts`**:
   - Import `insertTabInGroup` from `../tab/index.js`.
   - Add two parameters to `openProfileEditors`: `defaultGroup: number` and
     `colorForGroup: (group: number, fallbackDotColor: string) => string`.
   - Around the `managers.openFile.edit(...)` call: capture `tabs.length` before the call; after
     it, if the length grew (a new tab was created, not a reused one), read the tab at
     `managers.tab.activeTab`, compute `targetGroup = entry.tab?.group ?? defaultGroup`, and if
     `tab.group !== targetGroup`, remove it from its current position, rebuild it with
     `group: targetGroup, groupColor: colorForGroup(targetGroup, tab.dotColor)`, reinsert with
     `insertTabInGroup`, and `setActiveTab` to its new index.

## Tests

- **`src/profile/agent-opener.test.ts`** (new cases under `'openProfileEntries — group authoring'`):
  - Two entries authoring different groups end up tagged with those groups, and an entry that
    authors no group still gets the default next-free group (three-way split in one launch).
  - An agent entry authoring a group matching a pre-existing tab's group is inserted contiguously
    next to that tab (not appended after unrelated later groups), and inherits that group's
    existing `groupColor` rather than picking a new color.
  - An entry landing in a brand-new group (no pre-existing tab in it) anchors that group's color
    to its own dot color.
- **`src/profile/editors.test.ts`** (extend existing cases + new case):
  - Update existing cases to pass the new `defaultGroup`/`colorForGroup` params.
  - New case: an editor's authored `tab.group` differs from the group the newly created tab
    inherited from the active tab — assert the final tab list has the editor relocated into the
    authored group, contiguous with other tabs already in that group, with the group's color.
  - New case: an editor with no authored group keeps whatever group it inherited when that
    already equals `defaultGroup` (no relocation, no unnecessary array rebuild).

## Spec

- **`product/specs/profiles.md`**:
  - "Both kinds of entry group their tab presentation..." paragraph: reword `group`'s description
    from "an explicit group number for the whole profile" to reflect it's the entry's own group.
  - "Profile-level editor tabs" paragraph: note `tab` also supplies `group`, alongside `number`
    and `focus`.
  - "Relaunching" paragraph: replace "All of a launched profile's entries are placed into a single
    new group..." with the per-entry-group behavior and the default-group fallback, including how
    a group's color is chosen (existing group's color when joining one already on screen,
    otherwise the first tab landing in a new group).
  - "`profile save <name>`" section: the note that relaunching always merges a saved profile's
    split groups back into one no longer applies — update to say the split round-trips.

## Out of scope

- Threading an explicit `group` parameter through the general `edit`/`openEditorTab`/`addEditorTab`
  stack used by the interactive `edit` command — the post-creation relocation in `editors.ts`
  achieves the same end state without touching code shared by non-profile flows.
- Reordering profile-level file-navigator/notifications/schedules tabs relative to entries/editors
  by group — those have no `number`/`group` field of their own and are not part of the issue.
- Changing how `closeMatchingTabs` matches tabs for relaunch — matching is by label, independent
  of group, and is unaffected by this fix.
