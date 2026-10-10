# Move Markdown loading and preparation behind a hook

Complexity: 6/10

## Goal

Move Markdown source loading and rendering decisions out of `MarkdownTab`, cancel stale requests, and render filenames and parse-failure source as text rather than interpolated HTML.

## Approach

Add a framework-free source loader that accepts the host-resolved URL, AbortSignal, and injectable fetch function. Add a colocated hook that owns request cancellation, rejects stale completions, calls the published Markdown renderer, and returns explicit loading, loaded-HTML, loaded-text, or failed states. Keep the tab's metadata and active-pane keyboard behavior in place, and render only sanitized success HTML as HTML.

## Implementation steps

1. Add `markdown-source.ts` with an injectable fetch boundary, response-status check, and signal propagation.
2. Add `useMarkdownContent.ts` to own AbortController lifecycle, stale-result suppression, Markdown rendering, and the discriminated content state.
3. Update `MarkdownTab.tsx` to consume that hook and render failures and parse-failure text through React text nodes.
4. Add loader and hook tests for errors, abort, URL replacement, stale completion, and parse failure; extend the tab test for a markup-bearing filename and update its fetch options assertion.
5. Update the Markdown-tab functional spec and user documentation where they describe the changed failure rendering, then promote this plan and remove only this backlog item.

## Tests

- Cover successful source loading, non-OK responses, and passing the AbortSignal to the injected fetcher.
- Cover abort on cleanup, URL replacement, ignored stale completions, and loaded-text fallback on parse failure.
- Preserve Markdown metadata, successful rendering, keyboard activity, host resource URL, and failure behavior; assert filename markup renders literally.
- Run `./scripts/run.mjs check-diff` after each implementation step and after spec, documentation, and backlog changes.

## Out of scope

- Changing the shared Markdown parser/sanitizer, plugin exports, source snapshot behavior, keyboard controls, or file serving protocol.
