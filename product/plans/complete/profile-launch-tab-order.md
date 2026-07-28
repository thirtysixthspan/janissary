# Order profile-launch tabs by number across entries and editors

**Complexity: 3/10** — one function already computes everything needed (`candidates` carries a
`number` for every agent/harness/editor tab); the fix adds a single reordering pass over an
existing array instead of new architecture.

## Goal

`profile launch` documents that "entries are opened in `number` order" (`product/specs/profiles.md`),
but today only agent/harness entries are number-ordered among themselves — every editor tab from
the profile's `editors` key is appended to the tab strip after **all** agent/harness entries,
regardless of its own `tab.number`. A profile that authors `{ tab: { number: 1 } }` on an editor
and `{ tab: { number: 2 } }` on a harness still opens the harness tab first. Fix: once every
agent/harness entry and editor tab from a profile launch is open, reorder the profile's own tab
group so the whole run — harness/agent tabs and editor tabs together — reads in ascending `number`
order (tabs without an authored number keep their current relative order, at the end), without
touching any other group already on screen.

## Design decisions

**Reorder in place after everything opens, don't rebuild the opening pipeline.** `openProfileEntries`
(`src/profile/agent-opener.ts`) already builds a `candidates: MainAreaCandidate[]` array — the
same `{ label, number, focus }` shape is populated both for agent/harness entries (`entry.number`)
and for editors (`entry.tab?.number`) once `openProfileEditors` runs. Reusing that array to build a
`label -> number` map means no new field needs threading through `entry-openers.ts` or
`editors.ts`. A final pass sorts only the tabs belonging to this launch's target `group` by that
map (falling back to `Infinity`, matching the `a.number ?? Infinity` convention `focusedMainAreaLabel`
and `mapEntries` already use), then renumbers.

**Group-scoped, not whole-array.** The sort must only reorder tabs whose `group` equals the
profile's target group (the value already computed at the top of `openProfileEntries`) — tabs
belonging to other groups already on screen must not move. `Array.prototype.toSorted` is stable, so
a tab from this launch's group with no authored number (e.g. a docked file-navigator tab that
happens to land in the same group) keeps its current relative position among other unnumbered tabs.

**Where to run it.** After `candidates.push(...openProfileEditors(...))` and before
`focusedMainAreaLabel` is computed — focus resolution is already order-independent (it filters/sorts
`candidates` itself), so running the physical reorder first or after doesn't change the focus
result, but doing it before keeps `managers.tab.findIndex(focusLabel)` (used right after) pointed at
the tab's final position.

## Implementation

1. **`src/tab/utils.ts`** — no changes; reuse the existing `renumberTabs`.
2. **`src/profile/agent-opener.ts`**:
   - Add a small local helper, `reorderGroupByNumber(managers, group, numbers)`: collect the
     indices of `managers.tab.tabs` whose `group === group`, extract that slice, `toSorted` by
     `(numbers.get(tab.label) ?? Infinity)`, splice the sorted tabs back into the same index
     positions, then `managers.tab.tabs = renumberTabs(next)`.
   - After the `candidates.push(...openProfileEditors(...))` line, build `const numbers = new
     Map(candidates.filter((c) => c.number !== undefined).map((c) => [c.label, c.number]))` and
     call `reorderGroupByNumber(managers, group, numbers)`.
   - Import `renumberTabs` from `../tab/utils.js`.

## Tests

- **`src/profile/agent-opener.test.ts`**:
  - Update the existing `'opens editors after entries and activates the lowest-numbered focused
    entry'` test: it currently asserts editors always open after entries via mock call order, which
    is still true (editors are still opened in a later pass), but add a case where an editor's
    `tab.number` is lower than a harness/agent entry's `number` and assert the final
    `managers.tab.tabs` order places the editor tab before that entry's tab.
  - New case: entries and editors with interleaved numbers (e.g. harness `number: 1`, editor
    `number: 2`, agent `number: 3`) end up in that exact order in `managers.tab.tabs`.
  - New case: a tab in the same group with no authored number keeps its relative position (stable
    sort) rather than jumping to the front.
  - New case: tabs in a *different* group (already on screen before launch) are untouched by the
    reorder.

## Spec

- **`product/specs/profiles.md`** — clarify the `profile launch` paragraph (and the "Profile-level
  editor tabs" paragraph) so it's explicit that editor tabs are ordered by `number` alongside
  agent/harness entries, not always placed after them.

## Out of scope

- Making `openAgentEntry` in `src/profile/entry-openers.ts` use `insertTabInGroup` instead of a raw
  array append (a separate, pre-existing group-contiguity gap for the case where a profile reuses
  an *existing* group rather than creating a new one — not part of this issue's reported symptom).
- Honoring a per-editor authored `group` override (`ProfileEditorsEntry.tab.group`) — profiles
  already force every entry into a single new launch group regardless of any entry's own `group`
  (documented in `profiles.md`), so an editor's authored `group` is equally ignored today for
  reasons outside this issue.
- Reordering profile-level file-navigator/notifications/schedules tabs relative to entries/editors
  — those have no `number` field and are not part of the issue's reported symptom.
