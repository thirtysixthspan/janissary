# Swap the unread badge icon from a solid star to a regular flag

**Complexity: 3/10** — a single icon swap in the central icon registry, plus a new (already-versioned, already-in-use-elsewhere-in-the-ecosystem) dependency for the "regular" Font Awesome icon set. No component logic, wire protocol, or data model changes.

## Goal

The unread badge shown on inactive tabs (`product/specs/tabs.md:55`) currently renders as a solid star icon (`faStar`, from `@fortawesome/free-solid-svg-icons`, registered as `unreadIcon` in `web/src/icons.ts`). Per the backlog request, switch it to the Font Awesome **regular** (outline) flag icon — `fa-regular fa-flag` — instead.

## Approach

Font Awesome's React bindings select solid vs. regular by which package the icon object is imported from, not by a CSS class name — `@fortawesome/free-solid-svg-icons` exports solid glyphs, `@fortawesome/free-regular-svg-icons` exports the regular/outline set. The regular package is not currently a dependency, so it must be added (same major/minor version as the other `@fortawesome/*` packages already in `package.json`, `^7.3.1`, confirmed available on the npm registry).

`web/src/icons.ts` is the single place icon choices live (per its own header comment), so the swap is a one-line import change there; no other file references `faStar` directly — every consumer imports the semantic name `unreadIcon` from `icons.ts`.

## Implementation steps

1. Add `@fortawesome/free-regular-svg-icons` (`^7.3.1`) to `package.json` `dependencies`, alongside the existing `@fortawesome/free-solid-svg-icons` entry. Run `npm install --ignore-scripts` to update `package-lock.json`.
2. In `web/src/icons.ts`, change the `unreadIcon` export from `faStar` (imported from `@fortawesome/free-solid-svg-icons`) to `faFlag` imported from `@fortawesome/free-regular-svg-icons`. Add a new `import { faFlag as unreadIcon } from '@fortawesome/free-regular-svg-icons';` statement (or an `export { faFlag as unreadIcon } from ...` re-export, matching the existing re-export style) and remove `faStar as unreadIcon` from the solid-icons re-export block.

## Tests

No new test cases are needed. `web/src/TabStrip.test.tsx:95`/`:97`/`:104` assert on the `.tab-badge` CSS class and its presence/absence and pass unchanged. One existing assertion at `:96` checks the rendered glyph directly (`svg[data-icon="star"]`) and must be updated to `svg[data-icon="flag"]` to match the new icon. Run `./scripts/run.mjs check-diff` to confirm.

## Spec updates

- `product/specs/tabs.md:55` — change "an **unread badge** (a star icon)" to "an **unread badge** (a flag icon)".

## Docs

- Checked `help.md` — no mention of the unread badge. No update needed there.
- `documentation/user-documentation/getting-started/tabs.md` describes the badge as "a sparkle (✨)" (already stale relative to the current `faStar` icon it documents). Since this fix changes that icon's appearance, correct the description in place to describe the new flag icon rather than leaving the pre-existing sparkle/star mismatch.

## Out of scope

- Any other icon in `web/src/icons.ts` — only `unreadIcon` changes.
- The badge's positioning, sizing, or CSS (`web/src/theme.css:260`) — unaffected, the glyph swap doesn't change layout.
