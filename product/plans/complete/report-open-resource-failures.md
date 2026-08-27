# Report open-resource read failures

**Complexity: 5/10** — the change is localized to the authenticated file route and one fetch-based plugin consumer, with focused server and client tests.

## Goal

A registered file that becomes missing or unreadable must surface as a load failure, never as a successful empty editor document or rendered HTTP error body.

## Approach

Require the open-file route to establish file metadata before range handling and return a non-success response when metadata or full-body reads fail. Require the Markdown view to reject every non-OK fetch response before reading its body, using its existing failure presentation.

## Implementation steps

1. Update `src/open-route.ts` to return 404 when the registered file can no longer be statted and 500 when a full-body read fails.
2. Update `web/src/plugins/markdown/MarkdownTab.tsx` to treat a non-OK response as a failed load.
3. Add server coverage for a missing registered resource and client coverage for a non-OK Markdown response.
4. Update `product/specs/open.md` and `product/specs/markdown-tab.md` with the resource-failure behavior.
5. Update the existing Markdown preview user documentation with its visible failure message.

## Tests

- A missing file served through the open route answers 404 with no successful body.
- A non-OK Markdown fetch renders the existing failed-to-load line rather than the response body.
- Run `./scripts/run.mjs check-diff` after every implementation, test, spec, documentation, and backlog change.

## Out of scope

- Retrying resource reads automatically.
- Recovering an editor tab after its backing file is deleted.
- Changing range parsing or mid-stream socket error handling.
