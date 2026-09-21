# Route the last hand-written view-kind checks through the tab view guards

**Complexity: 3/10** — one small, deliberate behavior change in a single function
(`sameDockKind`), plus three mechanical conversions from an inline `view === '<kind>' && tab.<kind>`
pair to the existing guard call. No new modules, no design work — `src/tab/view-guards.ts` and
`web/src/shared/tab-view-guards.ts` already exist and already export exactly the predicates needed.

Both halves of the app have a guard module (`src/tab/view-guards.ts`, `web/src/shared/tab-view-guards.ts`)
that checks a tab's view discriminant together with the payload that discriminant implies, but almost
nothing imports them (two non-test server modules), so the invariant is still re-derived inline at
most call sites — and where it is re-derived with optional chaining instead of a presence check, two
tabs that are both missing the payload compare as equal. `sameDockKind` in `src/tab/dock.ts` returns
`candidate.plugin?.id === tab.plugin?.id` once both tabs are known to be plugin tabs —
`undefined === undefined` is `true`, so a tab whose plugin record is absent matches any other such
tab, and docking a plugin tab into a sidebar can displace an unrelated plugin's docked tab whenever
both have lost their plugin record.

## Goal

`sameDockKind` uses `isPluginTab` and no longer treats two payload-less plugin tabs as the same kind —
not matching is the behavior the guard module's own comment argues for, and it is a genuine behavior
change with its own test. The three inline payload-touching pairs the entry names convert to the
existing guard call, unchanged in behavior. The sites that test only the discriminant and never touch
a payload (`src/schedule/manager.ts`, `src/monitor/targets.ts`, `src/commands/send.ts`) and
`src/sessions/snapshot.ts`'s `tabKind` (same shape — discriminant only) are left exactly as they are,
since a guard there would narrow something they do not read.

## Approach

1. **`src/tab/dock.ts`'s `sameDockKind`**: replace the plugin branch's `candidate.plugin?.id ===
   tab.plugin?.id` with `isPluginTab(candidate) && isPluginTab(tab) && candidate.plugin.id ===
   tab.plugin.id`, keeping the non-plugin branch (`candidate.view === tab.view`) exactly as it is —
   no payload to check for the built-in kinds. Import `isPluginTab` from `./view-guards.js`.
2. **`src/sessions/snapshot.ts`'s `tabName`**: `if (tab.view === 'files' && tab.files) return
   \`files ${tab.files.root}\`;` becomes `if (isFilesTab(tab)) return \`files ${tab.files.root}\`;`.
   `tabKind` (a few lines above, discriminant only, no payload read) is untouched.
3. **`web/src/ViewTabBody.tsx`**: `if (tab.view === 'files' && tab.files) {` becomes
   `if (isFilesTabView(tab)) {`, importing from `./shared/tab-view-guards`.
4. **`web/src/Sidebar.tsx`**: `{current.tab.view === 'files' && current.tab.files && (` becomes
   `{isFilesTabView(current.tab) && (`, same import.

## Implementation steps

1. `src/tab/dock.ts`: convert `sameDockKind`'s plugin branch, add the `isPluginTab` import.
2. `src/sessions/snapshot.ts`: convert `tabName`, add the `isFilesTab` import.
3. `web/src/ViewTabBody.tsx` and `web/src/Sidebar.tsx`: convert, add the `isFilesTabView` import.
4. Run `check-diff` after each file.

## Tests

- `src/tab/dock.test.ts` — add a case pinning the fixed behavior: two tabs both with `view: 'plugin'`
  and no `plugin` payload no longer displace each other when docked to the same side (mirrors the
  existing "leaves a docked tab of another built-in kind alone" shape, since a payload-less plugin tab
  is now treated as not matching, the same as a different kind). Every existing case in the file — the
  two real-plugin cases, the same-built-in-kind case, the different-built-in-kind case — must keep
  passing unchanged, since none of them touch the payload-less path.
- No new test needed for `snapshot.ts`, `ViewTabBody.tsx`, or `Sidebar.tsx` — these three conversions
  change no behavior, so their existing tests (`src/sessions/manager.test.ts`'s row-name cases,
  `web/src/file-navigator/FileNavigatorTab.test.tsx`, `web/src/App.test.tsx`) passing unchanged is the
  verification.

## Out of scope

- `src/schedule/manager.ts`, `src/monitor/targets.ts`, `src/commands/send.ts`, and `tabKind` in
  `src/sessions/snapshot.ts` — each tests the discriminant alone and never reads a payload, so a guard
  call there would narrow something the site does not use.
- Any change to `src/tab/view-guards.ts` or `web/src/shared/tab-view-guards.ts` themselves — both
  already export exactly the predicates this item needs.
