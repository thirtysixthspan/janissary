# Make URLs clickable in plain text transcript output

**Complexity: 3/10** — Extend the existing file-link segment system to detect URLs and open them in a web tab.

## Goal

When a plain-text URL (e.g. `https://www.google.com`) appears in transcript output, it should be clickable and open the URL in an in-app web tab (not the default browser). Currently only file:line patterns are detected; URLs pass through as plain text.

## Approach

1. Add a `'url'` variant to `FileLinkSegment` in `file-link.ts`.
2. In `fileLineSegments`, detect `https?://` URLs at each position before falling through to file:line detection. This also prevents false file:line matches on URL port numbers like `:80`.
3. In `renderFileLinkSegments`, handle URL segments by sending `open <url>` instead of `edit <path>`.
4. Update `linkifyMarkdown` to preserve URL segments as-is (they are already valid URLs in markdown).

## Implementation steps

1. **Add URL segment type** — `file-link.ts`: extend `FileLinkSegment` with `{ type: 'url'; fullMatch: string; url: string }`.
2. **Detect URLs in the segment parser** — `file-link.ts`: add `https?://` regex check at the start of each iteration in `fileLineSegments`.
3. **Render URL segments** — `file-link.ts`: handle `type: 'url'` in `renderFileLinkSegments` with `open <url>` command.
4. **Update `linkifyMarkdown`** — `file-link.ts`: preserve URL segments unchanged (they are already valid markdown links).

## Tests

- `web/src/file-link.test.tsx` — new test cases for `fileLineSegments`: standalone URL, URL with trailing text, URL with port number, multiple URLs mixed with file:line patterns.
- `web/src/file-link.test.tsx` — new test case for `renderFileLinkSegments`: URL click sends `open <url>` command.

## Out of scope

- Markdown content (already handled via `<a>` click handlers).
- Non-http protocols (ftp, mailto, etc.).
- URL shortening or display formatting.

## Verification

`./scripts/run.mjs check-diff` must pass clean.
