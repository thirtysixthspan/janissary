# Preserve horizontal padding in sessions tables

**Complexity: 1/10** — the requested layout is already implemented; this records it in the sessions spec and pins it with the existing stylesheet test.

## Goal

Keep horizontal breathing room around both sessions table headings and rows.

## Approach

The shared sessions grid already applies `0 12px` padding to headings and `4px 12px` to rows. Add a focused stylesheet assertion and document the layout.

## Tests

- `web/src/plugins/sessions/sessions-style.test.ts` — verifies both grid surfaces carry 12px horizontal padding.

## Spec updates

- `product/specs/sessions-tab.md` — records horizontal padding for headers and rows.

## Docs

- None needed; public documentation does not describe this layout detail.

## Out of scope

- Column sizing and vertical spacing.
