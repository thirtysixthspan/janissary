# Colocate single-consumer root modules

## Complexity

3/10 — four file moves plus five import-path rewrites, no logic changes and no new architecture.

## Goal

Four modules sit in the flat `web/src` root as though they were shared, but each one's entire consumer set already lives inside a single feature directory. Move each into the directory that owns it so §2 of the React organization guidelines (colocate by default; promote on the second real consumer) reads forwards rather than backwards, and so a future cross-feature use becomes a lint error instead of a habit.

## Approach

Each module moves into its sole consumer's directory, keeping its contents unchanged apart from relative import paths. The consumers each rewrite one import path. Confirm per module, before moving it, that it still has exactly one consuming directory and carries no knowledge beyond that feature — that is the entire justification for the move.

- `web/src/search-intercept.ts` → `web/src/agent-tabs/command-input/` — imported only by `command-interceptions.ts` in that directory. No imports of its own.
- `web/src/populate-command-line.ts` → `web/src/pickers/` — imported only by `useTaskPicker.ts` and `useProfilePicker.ts` there. Its own `./ws` and `./drop-handles` imports become `../`.
- `web/src/tab-flag-display.ts` → `web/src/shared/` — imported only by `shared/AgentTabMeta.tsx`. Its own `./icons` import becomes `../icons`; the shared lint zone forbids importing a feature, and `icons.ts` is a root module, so the move stays legal.
- `web/src/useSelectionAction.ts` and its colocated `web/src/useSelectionAction.test.ts` → `web/src/file-navigator/` — imported only by `FileNavigatorTab.tsx` and `FileNavigatorRows.tsx` there. Its own `./ws` import becomes `../ws`; the test's `./useSelectionAction` import stays valid from the new directory.

## Implementation

1. `git mv web/src/search-intercept.ts web/src/agent-tabs/command-input/search-intercept.ts` and change `command-interceptions.ts` to import `./search-intercept`.
2. `git mv web/src/populate-command-line.ts web/src/pickers/populate-command-line.ts`, rewrite its `./ws` and `./drop-handles` imports to `../ws` and `../drop-handles`, and change `useTaskPicker.ts` and `useProfilePicker.ts` to import `./populate-command-line`.
3. `git mv web/src/tab-flag-display.ts web/src/shared/tab-flag-display.ts`, rewrite its `./icons` import to `../icons`, and change `AgentTabMeta.tsx` to import `./tab-flag-display`.
4. `git mv web/src/useSelectionAction.ts web/src/file-navigator/useSelectionAction.ts` and `git mv web/src/useSelectionAction.test.ts web/src/file-navigator/useSelectionAction.test.ts`, rewrite the module's `./ws` import to `../ws`, and change `FileNavigatorTab.tsx` and `FileNavigatorRows.tsx` to import `./useSelectionAction`.
5. Run `./scripts/run.mjs check-diff` after each move.

## Tests

No new tests. The moved `useSelectionAction.test.ts` is the cover for the only module of the four with behavior worth asserting, and it must keep passing from `web/src/file-navigator/` with no changes beyond its location. The existing `AgentTabMeta`, picker, and command-interception suites cover the other three modules through their consumers and must keep passing unchanged.

## Out of scope

- `web/src/fuzzy-match.ts` and any other root module with more than one consuming directory — those correctly stay at the root under §2.
- Promoting `useSelectionAction` back to the shared layer for a hypothetical second multi-row-selection surface. It has one consumer today; a second one is what would justify the promotion.
- Any change to the modules' contents beyond their relative import paths.
- Adding new ESLint feature zones — all four destinations are already covered directories.

## Verification

- `./scripts/run.mjs check-diff` passes after each move.
- `grep` for each moved module's name across `web/src` shows no remaining root-relative import.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor; nothing a user can observe changes.
