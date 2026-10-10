# Launcher limits summaries to terminal tabs

**Complexity: 5/10** — summaries need a shared eligibility rule, stale summaries must be cleared when a tab changes kind, and other tab kinds need a compact metadata row.

## Goal

Show ACP-written summaries only for shell, harness, and SSH tabs. Show every other center tab as one metadata line with its color dot, name, type, and time.

## Approach

Classify each activity row as shell, harness, SSH, agent, or its plugin/view kind. Use one shared predicate to decide which types may be summarized. Clear a summary when a still-open tab becomes ineligible, and render the type beside the name for ineligible rows while omitting their summary text.

## Implementation steps

1. Add the tab type to launcher activity projections and carry it into the validated launcher row contract.
2. Define the eligible summary types in the launcher shared contract; filter flush reads and clear stale summaries for ineligible tabs.
3. Render non-summary rows as one compact line with a static dot, name, type, and relative time.
4. Add server and client tests for type classification, summary eligibility, summary removal, and one-line metadata rows.
5. Update `product/specs/launcher.md` to document the summary types and metadata-only rows.

## Tests

- `src/plugins/activity.test.ts`: maps shell, harness, SSH, editor, and plugin tabs to their display types.
- `src/plugins/launcher/activate.test.ts`: only shell, harness, and SSH activity reaches the summarizer; stale summaries are removed when a tab becomes ineligible.
- `web/src/plugins/launcher/LauncherTab.test.tsx`: other tab types show one line with dot, name, type, and time, with no summary; eligible terminal types can still show summaries.
- Run the diff-scoped server and web checks.

## Out of scope

- Changing the five attention tiers or their ordering.
- Changing transcript or editor-content sources for eligible summary types.
- Changing tab status color or busy indicators; the following backlog entry covers dot behavior.
