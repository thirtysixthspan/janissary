# Light-on-dark refresh icon in the sessions metadata row

## Complexity

1/10 — a stylesheet rule matching the conversations list's existing treatment.

## Goal

The refresh button in the sessions tab's metadata (header) row arrives with the browser's default button chrome, so its icon reads bright against the dark header. The entry asks for the same muted, light-on-dark icon treatment the conversations list gives the buttons in its own metadata rows.

## Approach

Add the conversation list's icon-button rule to `web/src/plugins/sessions/sessions.css`, scoped to `.session-list-header .plugin-actions button`: transparent background, no border, `var(--muted)` icon, `var(--fg)` on hover.

## Tests

New `web/src/plugins/sessions/sessions-style.test.ts` (raw-CSS pattern of `conversations-style.test.ts`): the sessions stylesheet carries the muted button rule and its hover state.

## Out of scope

- Other backlog entries; the conversations stylesheet, which already has this treatment.
