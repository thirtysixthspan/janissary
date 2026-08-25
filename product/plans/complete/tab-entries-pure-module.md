# Move `TabEntry` and `isReportingTab` into one pure module

**Complexity: 2/10** — two declarations move into a new file with no body changes, and nine files repoint a type-only or single-function import. No runtime behavior changes anywhere.

## Goal

`web/src/ReportingSection.tsx:12` declares the three-line `isReportingTab(tab)` predicate inside a component file that imports React, `MonitorTab`, `TabStrip`, `ResizeButton`, and `drag-resize`. Two hook modules import it back up the stack — `web/src/useTabEntries.ts:3` and `web/src/useSectionNav.ts:3` — along with `web/src/TabNavPicker.tsx:5`. In the other direction, `ReportingSection.tsx:7` imports `type { TabEntry }` from `useTabEntries.ts`.

That is §8 of [`react-code-organization.md`](../../../ai/guidelines/react-code-organization.md) — each layer imports downward only; a hook may import services and pure modules, never a component — and it has already closed a loop: the component and the hook module each import the other.

The cost is that asking "is this a monitor tab?" drags the whole reporting UI subtree into the asker's module graph. `useSectionNav.ts`'s `getPresentSections` and `resolveCurrentSection` are pure functions with no JSX, yet cannot be typechecked or tested without `MonitorTab` and FontAwesome coming along. `ReportingSection.tsx` is one of the more churned files in `web/src/`, so each edit to it re-touches the module every tab hook depends on.

Leave `web/src/` with one pure module that owns both symbols, and no component or hook importing upward for them.

## Approach

Create `web/src/tab-entries.ts` — a pure module in the sense of §8's first row: no React import, no JSX, exercised by plain function calls. It holds the two declarations verbatim, along with the comments that already explain them:

- `export type TabEntry = { tab: TabView; index: number }`, moved from `useTabEntries.ts:6`.
- `export function isReportingTab(tab: TabView): boolean`, moved from `ReportingSection.tsx:12`.

The two belong in the same module rather than two: `isReportingTab` is the rule that decides which `TabEntry` values land in which list, and every consumer of one is a consumer or near-neighbour of the other. `TabView` comes from `@shared/protocol`, which is the only import the new module needs.

Both old homes keep everything else they have. `useTabEntries.ts` keeps `useTabEntries` and `reorderTabEntries`; `ReportingSection.tsx` keeps the component, `DEFAULT_PCT`, and the `ReportingEntry` alias. Neither re-exports the moved symbol from its old home — §2 says move the file, don't leave a copy behind or re-export it — so every consumer imports from `tab-entries.ts` directly, per [`imports-and-barrel-files.md`](../../../ai/guidelines/imports-and-barrel-files.md).

The two one-line aliases that sit on top of `TabEntry` stay where they are: `ReportingEntry` in `ReportingSection.tsx:17` and `TabNavEntry` in `TabNavPicker.tsx:8`. Each names the entry in the vocabulary of the surface that renders it, and both simply repoint their right-hand side at the new module. `TabNavEntry`'s eventual home is the tab-nav matching entry that follows this one in the backlog, and is deliberately not pre-empted here.

The backlog entry counts four production files and one test. The true count is nine production files and one test: `TabEntry` has four consumers the entry does not list — `AppMain.tsx`, `AppCenterActionArea.tsx`, `CenterActionArea.tsx`, and `CenterActionAreaProps.ts` — each a type-only import that must repoint along with the rest, since the type no longer lives where they import it from. This changes nothing about the shape of the work; it is the same one-line import edit in four more files.

## Implementation steps

1. Create `web/src/tab-entries.ts` importing `type { TabView } from '@shared/protocol'`, and move both declarations into it with their existing comments: the `TabEntry` type from `useTabEntries.ts` and `isReportingTab` from `ReportingSection.tsx`.
2. `web/src/useTabEntries.ts` — delete the `TabEntry` declaration and the `./ReportingSection` import; import `type { TabEntry }` and `isReportingTab` from `./tab-entries`.
3. `web/src/ReportingSection.tsx` — delete the `isReportingTab` declaration and its comment; repoint the `type { TabEntry }` import from `./useTabEntries` to `./tab-entries`.
4. `web/src/useSectionNav.ts` — import `isReportingTab` from `./tab-entries` instead of `./ReportingSection`.
5. `web/src/TabNavPicker.tsx` — import `isReportingTab` and `type { TabEntry }` from `./tab-entries`, dropping both the `./ReportingSection` and `./useTabEntries` imports.
6. `web/src/AppMain.tsx`, `web/src/AppCenterActionArea.tsx`, `web/src/CenterActionArea.tsx`, and `web/src/CenterActionAreaProps.ts` — repoint `type { TabEntry }` from `./useTabEntries` to `./tab-entries`.
7. `web/src/ReportingSection.test.tsx` — drop `isReportingTab` from its `./ReportingSection` import and delete the `describe('isReportingTab')` block, which moves to the new module's colocated test.

Relative imports in `web/src/` stay extensionless.

## Tests

`web/src/tab-entries.test.ts` (new) — the moved predicate's colocated test, carrying over the two cases removed from `ReportingSection.test.tsx` and adding the one the move makes worth pinning:

- Returns `true` for a tab whose view is `monitor`.
- Returns `false` for a tab whose view is `agent`.
- Returns `false` for the other non-monitor view kinds the app renders (`shell`, `editor`, `view`), so the predicate stays a monitor-only test as new view kinds arrive.

The file imports nothing but `vitest` and `./tab-entries`, which is the point of the move — the predicate is now testable without React in the module graph.

`web/src/ReportingSection.test.tsx` keeps every remaining case unchanged; its `ReportingEntry` import and `makeEntry` helper are untouched, since the alias still resolves to the same shape.

## Out of scope

- `reorderTabEntries`, a plain function that still lives in the `use*`-prefixed `useTabEntries.ts`. It is a separate §6 point and is not part of this move.
- The `TabNavEntry` alias and `filterTabs` in `TabNavPicker.tsx` — the next backlog entry owns those.
- Moving `useTabEntries.ts`, `useSectionNav.ts`, or `ReportingSection.tsx` into a feature directory.
- Any change to how reporting tabs are selected, rendered, or laid out.

## Documentation

None. Both symbols are internal to the web client and no user-visible behavior changes, so nothing `help.md`, the functional specs, or `documentation/user-documentation/` describes is now different.
