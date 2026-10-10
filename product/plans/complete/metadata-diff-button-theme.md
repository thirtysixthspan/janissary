# Metadata diff button theme

**Complexity: 2/10** — one focused stylesheet rule, a regression test, and a spec update.

## Goal

The workspace diff button in a shell or harness metadata row should render as a light icon on the dark row, matching the neighboring metadata actions.

## Approach

Add the missing `.tab-open-diff` theme rules to `web/src/theme.css`: transparent background, no border, muted icon, and a brighter hover state. Keep a disabled state dimmed while its workspace is provisioning. Add a stylesheet regression test in `web/src/theme.test.ts` and update `product/specs/tabs.md` to describe the appearance.

## Implementation steps

1. Add base, hover, and disabled styles for `.tab-open-diff` beside the related metadata action styles in `web/src/theme.css`.
2. Add a regression test that pins the flat muted appearance, hover color, and disabled treatment.
3. Update the metadata diff-button description in `product/specs/tabs.md`.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- Verify the button uses a transparent background, no border, muted color, and pointer cursor.
- Verify it brightens on hover.
- Verify its disabled state remains muted, dims, and uses the default cursor.

## Out of scope

- Changing the diff button's icon, label, availability, or behavior.
- Restyling other metadata actions.
