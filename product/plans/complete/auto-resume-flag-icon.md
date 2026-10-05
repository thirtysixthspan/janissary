# Give the auto-resume flag its own icon

**Complexity: 1/10** — one new export in the icon registry, two rows in the flag table, four test assertions, and the two places the shared bolt is written down.

## Goal

The auto-resume metadata flag shares the auto-approve **bolt** (`web/src/shared/tab/flag-display.ts`), so a tab can show two identical glyphs with different tooltips. Give auto-resume its own glyph.

## The icon asked for is not available

Font Awesome has an icon named `superpowers`, but it is a **brands** glyph — its own description reads *"Logo for Superpowers, a game development platform"* — and it is not in anything this repo installs:

- `@fortawesome/free-solid-svg-icons` and `@fortawesome/free-regular-svg-icons` are the only icon packages in `package.json`, and neither contains it;
- the project has no `@fortawesome/free-brands-svg-icons` dependency at all;
- `superpowers` appears in the installed tree only inside `fontawesome-common-types`'s union of every icon name Font Awesome ships anywhere, not as an icon this app can render.

So it is substituted with the closest free solid glyph that carries the same idea: `faWandSparkles`, a magic wand throwing sparkles — powers granted to the tab, and the "superpower" reading of the request taken literally. It is also visually unmistakable next to a bolt, which was the other half of the problem: `faBoltLightning` would have read as "power" while being indistinguishable from `faBolt` at the metadata row's size.

`faWandSparkles` lands behind the same registry indirection as every other glyph, so changing it later is one line.

## Approach

- `web/src/shared/icons.ts` — export `faWandSparkles as autoResumeIcon` beside `faBolt as autoPermitIcon`.
- `web/src/shared/tab/flag-display.ts` — both auto-resume rows take `autoResumeIcon`. The green `tab-flag--active` class on `autoResuming` and the labels are untouched.
- `web/src/shared/AgentTabMeta.test.tsx` — the two auto-resume cases assert `svg[data-icon="wand-sparkles"]`, and one additionally asserts the bolt is *not* drawn, so a regression back to the shared glyph fails rather than passing quietly.
- `product/specs/tabs.md` — the flag list and the three-looks paragraph stop calling it the same bolt.
- `documentation/user-documentation/advanced-agents/harness.md` — the auto-resume section stops saying it shows the auto-approval bolt.

## Tests

- `web/src/shared/AgentTabMeta.test.tsx` — `autoResume` and `autoResuming` render the wand, and neither renders the bolt.

## Spec updates

- `product/specs/tabs.md` § Metadata row.

## Docs

- `documentation/user-documentation/advanced-agents/harness.md` § Resuming after a usage limit.

## Out of scope

- `@fortawesome/free-brands-svg-icons`. Installing it to reach `faSuperpowers` would add a package for one third-party logo, and render a game platform's trademark in place of a generic glyph.
- The `docs/` screenshot of the metadata row, if one exists showing the bolt. No user-documentation image shows this flag.
- Auto-approve's bolt, which stays as it is.