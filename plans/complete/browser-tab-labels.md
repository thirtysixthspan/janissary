# Browser tab labels: show domain only; metadata shows URL + close button

## Issue

"browser tabs should show the domain on the labels and the metadata should show only the full URL and close button."

Currently page tab labels show `1) slashdot.org` (number + domain) and the metadata header shows the number, domain, and URL. The issue requests that labels show just the domain, and metadata only the URL and close button.

## Changes

1. `src/tab.ts` — `makePageTab` title becomes `page.domain` instead of `` `${page.number}) ${page.domain}` ``
2. `web/src/PageTab.tsx` — remove `.page-number` and `.page-domain` from the metadata `.page-meta` area; keep only `.page-url` and the close button. Update iframe `title` to just `page.domain`.
3. `web/src/PageTab.test.tsx` — update test expectations to match new label/metadata structure
4. `src/controller.test.ts` — update page tab title expectations
5. `specs/embedded-web-page.md` — update spec to reflect that metadata shows only the full address; tab label is just the domain; "Page number" section no longer claims the number appears in the label

## Verification

- `./scripts/run.mjs check-diff` passes (lint, tsc, server tests, web tests)

