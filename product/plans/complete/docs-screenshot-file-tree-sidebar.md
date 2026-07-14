# Docking-to-sidebar screenshot should show the whole application

**Complexity: 2/10** — a one-line manifest change plus regenerating one image via an existing, deterministic, already-used capture pipeline. The `target: 'page'` capture mode already exists and is used by another entry (`app-overview`); no new script logic needed.

## Goal

The public documentation's "Docking to a sidebar" section (`public-documentation/tab-types/file-navigator.md`) shows a screenshot (`/screenshots/file-tree-sidebar.png`) of a file navigator docked in the left sidebar. Today that image is cropped to just the sidebar element (560×1536px — a tall, narrow strip), not the whole application window, so it doesn't show the sidebar in context (tab strip, command bar, rest of the app chrome) the way the issue asks. After this fix, the same screenshot shows the entire application window with the file navigator visibly docked to the left, matching the `app-overview` screenshot's full-page framing.

## Approach

The screenshot pipeline (`scripts/docs-screenshots.mjs`, driven by `scripts/docs-screenshots/manifest.mjs`) launches the real app via Playwright/Chromium against fixture data and crops each capture to a `data-doc-shot` element named by the manifest entry's `target`, or to the literal string `'page'` for the whole viewport (already used by the `app-overview` entry). The `file-tree-sidebar` manifest entry currently sets `target: 'sidebar-left'`, which crops to just the sidebar container (`web/src/Sidebar.tsx`'s `data-doc-shot="sidebar-left"` div). Changing it to `target: 'page'` is the entire code fix — the capture setup (`setup: ['files left .']`, which docks a file tree into the left sidebar) is already correct and unchanged.

## Implementation steps

1. `scripts/docs-screenshots/manifest.mjs` — change the `file-tree-sidebar` entry's `target` from `'sidebar-left'` to `'page'`.
2. Regenerate the image: `npm run build:web` (the pipeline captures the built UI, not the dev server), then `./scripts/run.mjs docs-screenshots file-tree-sidebar` to recapture just this one shot, overwriting `public-documentation/public/screenshots/file-tree-sidebar.png` in place.

## Tests

No test changes — this is a manifest config value plus a regenerated binary asset; there is no automated test coverage for screenshot content in this repo (confirmed: no test file references the docs-screenshots pipeline or asserts on generated image content).

## Spec updates

None — `public-documentation/` is user-facing documentation, not one of the `specs/` functional-behavior files; the doc page's own screenshot reference and caption text are unchanged (the caption already accurately describes "a file navigator docked in the left sidebar, with its resize divider on the right edge," which remains true — it's now shown in the context of the full window rather than cropped to just the sidebar).

## Verification

- `./scripts/run.mjs check-diff` — the manifest edit is plain JS with no type-aware surface; the diff-scoped checks (lint/typecheck/tests) will pass trivially since `scripts/` isn't covered by the src/web project checks, but running it confirms no regressions in the rest of the working tree.
- Regenerating the image itself is the actual verification: after running `./scripts/run.mjs docs-screenshots file-tree-sidebar`, inspect the output PNG's dimensions (expect ~1536×1536, matching `app-overview.png`'s full-page framing, rather than the old 560×1536 sidebar-only crop) and visually confirm (via the Read tool's image support) that the file navigator appears docked to the left within the full application chrome.
- If Playwright's Chromium browser or a built `web/dist/` bundle isn't available in the execution environment, note that in the final report rather than silently leaving the stale cropped image in place.

## Out of scope

- Any other manifest entry or screenshot — only `file-tree-sidebar` is named in the tracked issue.
- Changes to `scripts/docs-screenshots.mjs` or `scripts/docs-screenshots/capture.mjs` — the `'page'` target mode already exists and needs no new logic.
