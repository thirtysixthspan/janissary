# Clickable file:line links open in editor tab, not viewer tab

**Complexity: 2/10** — change two string literals from `open` to `edit`, update related tests.

## Goal

When a user clicks a `filepath:line` link in transcript output (from both plain output lines and markdown), the file opens in an **editor tab** (same as typing `edit <filepath>`) instead of a **viewer tab** (same as `open <filepath>`). The viewer tab renders files by extension (markdown preview, image preview, etc.); the editor tab is the plain-text editor where changes can be made.

HTTPS links continue to use `open` — no change for web URLs.

## Background

The `open` command routes files through `OpenFileManager.run()`, which inspects the file extension and picks an appropriate viewer (markdown renderer, image viewer, etc.) or an editor. The `edit` command forces the plain-text editor regardless of extension.

## Approach

Two code locations send `open` when a file:line link is clicked. Change both to `edit`, but only for file:line links; HTTPS links remain `open`.

1. **`web/src/file-link.ts`** — `renderFileLinkSegments()` sends `open <path>` on click. This handles plain `output` type lines. Change to `edit <path>`.

2. **`web/src/transcript-line.tsx`** — the markdown `onLinkClick` handler sends `open <path>` for file:line markdown links. Change to `edit <path>` for file:line links while keeping `open` for HTTPS links.

## Implementation steps

1. **Change `web/src/file-link.ts:98`** — `open` → `edit` in the command string sent on file link click. Rename `openCmd` to `editCmd`.

2. **Change `web/src/transcript-line.tsx:39`** — differentiate between HTTPS links (keep `open`) and file:line links (use `edit`).

3. **Update `web/src/file-link.test.ts`** — add tests for `renderFileLinkSegments` that verify clicking sends an `edit` command.

4. **Update `web/src/transcript-line.test.tsx`** — add a test for file:line markdown link click sending `edit`. The existing HTTPS link test stays unchanged.

5. **Run `./scripts/run.mjs check-diff`** after each step.

## Tests

- `web/src/file-link.test.ts` — new test: `renderFileLinkSegments` with a link segment sends `edit <path>` on click
- `web/src/transcript-line.test.tsx` — new test: clicking a file:line markdown link sends `edit <path>`; existing HTTPS test unchanged

## Out of scope

- No server-side changes
- No changes to the `open` or `edit` command handlers
- HTTPS links remain unchanged

## Verification

`./scripts/run.mjs check-diff` must pass clean.
