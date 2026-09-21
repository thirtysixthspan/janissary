# Make sessions row actions neutral and distinguish closing actions

**Complexity: 3/10** — this is a small sessions-plugin presentation change confined to its row action map, stylesheet, tests, and existing functional spec.

## Goal

Make session row actions light on the dark surface without action-specific colors, use a circle-xmark for close and terminate, and ensure terminate controls consistently say “Terminate”.

## Approach

The sessions list owns all row action rendering in `SessionRowActions`, so replace its terminate and close glyphs with Font Awesome’s `faCircleXmark`. The attach/detach plug glyphs remain meaningful connection verbs. Remove the detach/attach color overrides from `sessions.css`; its existing muted default and foreground hover rule provide the requested light-on-dark treatment. The existing presentation map supplies the terminate title to SSH and every other row, and focused tests will preserve that contract.

## Implementation steps

1. Change the sessions row action presentation map to use `faCircleXmark` for both terminate and close actions.
2. Remove action-specific detach and attach color rules from the sessions stylesheet, retaining the neutral shared button treatment.
3. Update focused sessions list and stylesheet tests for the neutral treatment, circle-xmark glyphs, and terminate title.

## Tests

- `web/src/plugins/sessions/SessionList.test.tsx` — checks close/terminate glyphs and the terminate tooltip alongside the existing action map coverage.
- `web/src/plugins/sessions/sessions-style.test.ts` — verifies row actions use the muted default with foreground hover styling and carry no action-specific color rules.

## Spec updates

- `product/specs/sessions-tab.md` — describe neutral row actions and the circle-xmark closing controls.

## Docs

- Checked `help.md` and `documentation/user-documentation/`; neither documents sessions-row glyphs or action coloring, so no update is needed.

## Out of scope

- Remote metadata-row connection status and action glyphs.
- Session action behavior, availability, confirmations, and keyboard controls.
