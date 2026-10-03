# Search Request Coordination Hook

Complexity: 6/10

## Goal

Move project-search query history, seeding, filter and mode updates, and intent construction out of `SearchTab` so the component mainly coordinates focus and renders the tab.

## Approach

Add `useSearchController` in the search feature. It owns query-related state and handlers, composes the existing `useSeededQuery`, and accepts a narrow injected intent sender. Keep result-window selection, refs, keyboard navigation, and JSX in `SearchTab`. Preserve all current intent payloads and timing behavior.

## Implementation steps

1. Add `web/src/plugins/search/useSearchController.ts` with include and exclude values, local mode flags, query history initialized from the opened query, seeded-query adoption and echo suppression, and named handlers for searching, changing filters and modes, and opening a result. Inject a sender so the hook does not depend on plugin capabilities.
2. Update `web/src/plugins/search/SearchTab.tsx` to use the controller and retain only result selection, focus management, key handling, and rendering. Preserve the public component props and pass the current rows to the result-opening handler.
3. Add `web/src/plugins/search/useSearchController.test.ts` for typed query submission and history updates, filter and mode reruns using their newly changed value, seeded-query echo suppression, and selected-result opening through a fake sender. Keep `SearchTab.test.tsx` integration assertions unchanged.
4. Run `./scripts/run.mjs check-diff` after the source change and after the hook tests.
5. Confirm `product/specs/search-tab.md` remains accurate; this refactor must not change user-visible behavior, so no spec or public documentation edits are expected.

## Tests

Run the new hook tests and existing search-tab tests through `check-diff`. Preserve coverage for blank queries, deduplicated history, command-seeded query adoption, current filter and mode values in intents, and result path and line selection.

## Out of scope

Do not change the search wire contract, server search behavior, result ordering, search bar debounce or history navigation, result selection and scrolling, plugin entry points, persisted settings, or public documentation.
