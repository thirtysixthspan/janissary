# Show version in documentation site nav title

**Complexity: 2/10** — a single VitePress config addition; no source, no runtime behavior, no new tests possible (docs config is outside the vitest projects and eslint scope).

## Goal

On every page of the public documentation site, the "Janissary" text in the upper-left corner of the nav bar should include the current package version, e.g. `Janissary (0.5.5)`.

## Approach

VitePress's `themeConfig.siteTitle` controls exactly the text rendered next to the logo in the nav bar corner, independent of the top-level `title` (which feeds the `<title>` tag / page-title suffix and should stay unchanged). Read the version from the repo's root `package.json` at config-build time and set `themeConfig.siteTitle` to `` `Janissary (${version})` ``.

`documentation/.vitepress/config.mts` already imports `readFileSync` from `node:fs` and resolves paths with `node:path` (used by `copyAgentImages`), so reading `package.json` follows an existing pattern in the same file.

## Implementation steps

1. In `documentation/.vitepress/config.mts`, near the top (after the existing imports), read and parse the root `package.json` to get `version`:
   ```ts
   const pkg = JSON.parse(readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "package.json"), "utf-8")) as { version: string };
   ```
2. Inside `themeConfig` (`documentation/.vitepress/config.mts`, alongside `nav`/`sidebar`), add:
   ```ts
   siteTitle: `Janissary (${pkg.version})`,
   ```
3. Leave the top-level `title: "Janissary"` untouched — it drives the `<title>` tag, not the nav corner, and is out of scope.

## Tests

None. `documentation/.vitepress/` is excluded from both the `server` and `client` vitest projects and from ESLint (`eslint.config.mjs` ignores `documentation/.vitepress/`), so there is no automated test surface for this config value. Verification is manual (see below).

## Spec

Add a short note to the documentation-site behavior. Check `product/specs/` for an existing spec covering the docs site; if one exists, add a line noting the nav title shows the current version. If none exists, this is a minor addition to whichever spec covers developer/documentation tooling — skip creating a new spec file if no existing spec covers the docs site itself.

## Verification

- `./scripts/run.mjs check-diff` — confirms no lint/typecheck/test regressions elsewhere (the config file itself is out of scope for lint/tests, per above).
- Manual: run `npm run docs:dev`, load any page, and confirm the upper-left corner reads `Janissary (0.5.5)` (matching `package.json`'s current version).

## Out of scope

- Changing the `<title>` tag / browser tab title (top-level `title` config) — only the nav-corner text changes.
- Making the version update without a docs rebuild — the docs site is statically built, so the version is baked in at build time, consistent with how the site already ships.
