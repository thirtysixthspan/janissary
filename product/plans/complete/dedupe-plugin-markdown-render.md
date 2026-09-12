# Delete the duplicated Markdown-sanitize render module in the plugin adapter

## Complexity

3/10 — a re-export retarget, two file deletions, and folding the orphan test's sanitize assertions into the surviving module's test; the only subtlety is that the surviving test file mocks `marked`, so the real-parse sanitize cases delegate to the actual implementation.

## Goal

`web/src/plugins/markdown-render.ts` is a line-for-line copy of `web/src/shared/transcript/markdown.ts` — the same `marked` options, the same `DOMPurify.sanitize` call, the same try/catch — kept in a second place with a shadow test. This is security-relevant logic (the sanitization that keeps transcript-embedded HTML from becoming script), so a fix to one copy would leave the other serving unsanitized output. Keep one `renderMarkdown` and have the plugin adapter re-export the shared module.

## Approach

1. In `web/src/plugins/api.ts`, change the re-export from `./markdown-render` to `../shared/transcript/markdown`.
2. Delete `web/src/plugins/markdown-render.ts` and its shadow test `web/src/plugins/markdown-render.test.ts`. Nothing else imports `markdown-render`; the two consumers (`web/src/plugins/markdown/MarkdownTab.tsx`, `web/src/plugins/conversations/ConversationTab.tsx`) import through `../api`.
3. Fold the orphan `web/src/markdown-sanitize.test.ts`'s assertions — img event handlers, `javascript:` links, script tags, and the preserves-safe-markdown case — into `web/src/shared/transcript/markdown.test.ts`, then delete the orphan. That file mocks `marked` at module level, so the sanitize cases delegate to the real `marked.parse` via `vi.importActual` before calling `renderMarkdown`'s own pipeline through a local `sanitize` helper over the same options.
4. Re-run `web/src/plugins/api.test.ts` and the markdown plugin body tests, which consume the re-export and pin the plugin-facing surface.

`web/src/shared/transcript/markdown.ts` itself does not change.

## Implementation

1. Retarget the re-export in `api.ts`.
2. Delete the two plugin files.
3. Rewrite `markdown.test.ts` with the folded cases; delete `markdown-sanitize.test.ts`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

The folded sanitize cases are the new tests: img `onerror` stripped, `javascript:` URLs stripped, script tags stripped, safe markdown preserved. The existing `renderMarkdown`-returns-undefined case stays. `api.test.ts` and the markdown plugin suites must keep passing through the re-export.

## Out of scope

- Any change to the sanitize pipeline itself (marked options, DOMPurify config).
- The transcript's own markdown rendering beyond what it already shares.
