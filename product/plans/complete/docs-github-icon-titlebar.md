# GitHub icon in the documentation titlebar

**Complexity: 1/10** — a one-line addition to VitePress's own built-in `themeConfig.socialLinks`
option; VitePress's default theme already renders these as icons floated at the right edge of the
nav bar (the docs site's titlebar) with no custom code, CSS, or component needed.

## Goal

The documentation site's nav bar (titlebar) should show a GitHub icon, floated right, linking back
to the project's GitHub repository — the standard placement/behavior VitePress's default theme
already provides for `themeConfig.socialLinks`.

## Approach

`documentation/.vitepress/config.mts:140` already declares `socialLinks: []` (empty) inside
`themeConfig`. VitePress's default theme renders one icon per entry in that array at the right edge
of the nav bar — this is exactly the "floated right in the titlebar" placement the issue asks for,
built in, no custom markup. Populate it with one entry: `{ icon: 'github', link: <repo URL> }`,
using the repository URL already recorded in `package.json`'s `repository.url`
(`https://github.com/thirtysixthspan/janissary`).

## Reuse map

| Piece | Where | What it already does |
|---|---|---|
| `themeConfig.socialLinks` (empty today) | `documentation/.vitepress/config.mts:140` | VitePress's built-in nav-bar social-icon slot — already rendered by the default theme, just needs an entry |
| Canonical repo URL | `package.json:72` (`repository.url`) | `git+https://github.com/thirtysixthspan/janissary.git` — strip the `git+` prefix and `.git` suffix for the plain web URL |

## Implementation steps

1. **`documentation/.vitepress/config.mts`** — replace the empty `socialLinks: []` with:
   ```ts
   socialLinks: [
     { icon: "github", link: "https://github.com/thirtysixthspan/janissary" },
   ],
   ```

## Tests

None — this is pure VitePress theme configuration (a data value consumed entirely by the framework's
own default-theme rendering), not application source under `src/`/`web/src/` with a vitest project.
Nothing in `check-diff` covers `documentation/`. Verified instead by building the docs site and
confirming the icon renders and links correctly (see Verification).

## Verification

- `npm run docs:build` (or `docs:dev`) and visually confirm a GitHub icon appears at the right edge
  of the nav bar on any documentation page, linking to
  `https://github.com/thirtysixthspan/janissary`.

## Out of scope

- Any other social links (Discord, Twitter/X, etc.) — the issue asks for GitHub only.
- Custom icon styling or placement beyond VitePress's default theme behavior.
