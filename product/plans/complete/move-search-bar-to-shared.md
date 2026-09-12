# Move the search bar and transcript-search hook into the shared layer

## Complexity

4/10 — a mechanical move of four files plus import-specifier rewrites in four consumer files; no behavior change.

## Goal

`web/src/SearchBar.tsx` and `web/src/useTranscriptSearch.ts` are one cohesive cross-surface feature (a filter line over transcript-shaped buffers) sitting at the app root and imported by the agent-tabs command bar and the app's own view-search state — generic code placed at the app-shell layer that features import upward, against the one-way dependency flow (shared → feature → app). Move both into `web/src/shared/search-bar/`.

## Approach

Create `web/src/shared/search-bar/` and move `SearchBar.tsx` (with `SearchBar.test.tsx`) and `useTranscriptSearch.ts` (with `useTranscriptSearch.test.ts`) into it unchanged apart from relative specifiers. `SearchBar.tsx` imports `./useTranscriptSearch` — both move together, so that specifier stays.

Retargeting the consumers (the item's original list named `QuickOpen.tsx` and `FileSearchPopup.tsx`, but those only mention `SearchBar` in comments; the actual importers are):

- `web/src/agent-tabs/command-input/CommandArea.tsx`: `../../SearchBar` → `../../shared/search-bar/SearchBar`, `../../useTranscriptSearch` → `../../shared/search-bar/useTranscriptSearch`
- `web/src/agent-tabs/command-input/useCommandBarSubmit.ts`: `../../useTranscriptSearch` → `../../shared/search-bar/useTranscriptSearch`
- `web/src/agent-tabs/command-input/useCommandBarSubmit.test.ts`: the same type import
- `web/src/useViewSearchState.ts`: `./useTranscriptSearch` → `./shared/search-bar/useTranscriptSearch`

`useTranscriptSearch`'s dependency on the tab's own state stays as-is; nothing about exports changes.

## Implementation

1. `git mv` the four files to `web/src/shared/search-bar/`.
2. Retarget the four consumer files.
3. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — a pure move. `SearchBar.test.tsx` and `useTranscriptSearch.test.ts` keep passing with their own relative specifiers intact; `useCommandBarSubmit.test.ts` and the agent-tab suites stay green with retargeted imports.

## Out of scope

- Any behavior change to the search semantics.
- Moving other root modules.
