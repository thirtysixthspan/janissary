# Launcher tab dots stay static

**Complexity: 2/10** — the launcher already groups tabs by status, so only the dot styling and its test need to change.

## Goal

Keep launcher tab color dots static while the tier placement communicates tab status.

## Approach

Remove the busy-dependent CSS class from the dot and delete its blink animation. Keep the busy fact in each row for tier selection. Update the launcher spec and add a client assertion that a busy row's dot does not animate.

## Implementation steps

1. Remove the busy class from launcher dots and delete the launcher dot animation styles.
2. Add a client test that busy rows retain a static dot while remaining in the working tier.
3. Update `product/specs/launcher.md` to describe static dots and status tiers.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: a busy tab has the ordinary dot class with no busy animation class and remains in the Working tier.

## Out of scope

- Changing how tabs are sorted into attention tiers.
- Changing the color or shape of tab dots elsewhere in the app.
