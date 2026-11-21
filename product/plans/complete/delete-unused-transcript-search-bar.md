# Delete the unused transcript search-mode bar and hook from the shared layer

**Complexity: 1/10** — 0 lines added, 2 production modules deleted, 1 requirement and 1 test scenario (p=2.80).

`web/src/shared/search-bar/` holds a command-bar search-mode replacement (`SearchBar.tsx`) and its state hook (`useTranscriptSearch.ts`) plus their two colocated tests. Nothing in production imports either module; the only references are their own tests. The two comments that name `SearchBar` in `web/src/file-navigator/FileSearchPopup.tsx` and `web/src/pickers/QuickOpen.tsx` describe an autofocused input pattern and point at the live `web/src/plugins/search/SearchBar.tsx`, which stays. Neither symbol is re-exported by `web/src/plugins/api.ts` or `web/src/overlay-plugins/api.ts`. The `SearchStatus` type is defined and used only inside the directory. `@shared/search-matches` stays in use through `web/src/shared/transcript/line-text.tsx`, so no shared helper changes.

## Goal

Remove the dead shared search seam so the area has one live search implementation: `web/src/plugins/search/SearchBar.tsx` with `web/src/plugins/search/useSearchController.ts`, pinned by `web/src/plugins/search/SearchTab.test.tsx`. No user-visible behavior changes.

## Implementation steps

1. Delete the four files in `web/src/shared/search-bar/`: `SearchBar.tsx`, `useTranscriptSearch.ts`, `SearchBar.test.tsx`, and `useTranscriptSearch.test.ts`.
2. Run `./scripts/run.mjs check-diff` and confirm lint, typecheck, and the remaining web tests are green with no dangling imports.

## Tests

No new tests — deleting dead, unimported files. The live search surface stays covered by its existing suite:

- `web/src/plugins/search/SearchTab.test.tsx` — pins the live search bar, hook, and result stepping.
- `./scripts/run.mjs check-diff` catches any import that still reaches the deleted modules.

## Spec

No user-visible behavior changes — dead code removal. `Spec: none needed`.

## Out of scope

- Any change to the live search surface under `web/src/plugins/search/`.
- Any change to `@shared/search-matches` or its consumers.
- The historical `SearchBar`/`useTranscriptSearch` references in completed plans and `CHANGELOG.md`, which record past decisions rather than current behavior.
- Deleting other unused modules not named by this item.
