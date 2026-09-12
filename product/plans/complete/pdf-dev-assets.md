# Contain development PDF asset requests

Complexity: 3/10.

## Goal

Development requests serve only readable PDF assets inside the installed package, with an explicit content type. Missing, invalid, or escaping requests fall through to Vite.

## Approach and implementation

1. Extract the request-only middleware from web/vite.config.ts into web/pdfjs-assets.ts so its filesystem boundary can be tested independently. Keep generateBundle unchanged. Reject dot-only names, resolve package and candidate symlinks, check containment with path.relative, and handle read errors by falling through. Return a binary content type for character maps and Type 1 font data, and font/ttf for TrueType fonts. Add scripts/pdfjs-assets.test.mjs under the existing server test project; run check-diff.
2. Clarify development asset serving in the PDF spec. Verify the running Vite server serves a real CJK character map and font bytes and falls through for missing or invalid paths, using an explicit binary Accept header to avoid SPA HTML fallback. Rebuild the web app, complete the plan, and remove the final backlog file.

## Tests

Cover valid maps and fonts with MIME headers, unrelated routes, dot-only names, traversal, missing files, failed reads, symlink escapes (including sibling-prefix paths), and symlinked package roots. Use isolated fixtures beneath the project's temp directory. A live HTTP smoke check compares returned map/font bytes to the installed files. There is no attached browser for the requested visual CJK rendering check.

## Out of scope

Production bundle generation, application file-serving authentication, new asset directories, and PDF rendering behavior.

## Results

All 12 middleware tests and check-diff passed. The running Vite server returned the installed CJK map and TrueType font bytes exactly, with the expected MIME types; raw dot, traversal, and missing-asset requests returned Vite's 404. The production web build passed and its asset emission remained unchanged. Visual CJK rendering remains unverified because no browser is attached.
