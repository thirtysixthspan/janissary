# Guard web stylesheet minification against the `::highlight` lightningcss error

**Complexity: 1/10** — no production code changes. The error does not reproduce against the dependency tree the lockfile resolves. The work is a diagnosis and a regression test.

The issue reports a production-build failure from the CSS minifier: `[lightningcss minify] 'highlight' is not recognized as a valid pseudo-element`, pointing at `::highlight(shell-reply-selection)` in `web/src/plugins/shell/shell.css`. That rule landed on 2026-10-28 with pointer selection of rendered shell replies (#1823) and paints the reply selection through the CSS Custom Highlight API.

## Diagnosis

- Vite 8 minifies production CSS with lightningcss. The lockfile pins Vite 8.3.3, which requires `lightningcss ^1.33.0`. The lockfile has resolved lightningcss 1.33.0 since the Vite 8.3.3 upgrade on 2026-10-06 (#1552). It resolved 1.32.0 before that.
- `npm run build:web` on a fresh install of the lockfile emits no lightningcss warning, and the built `shell` stylesheet keeps `::highlight(shell-reply-selection){background-color:var(--editor-selection)}`.
- Minifying `shell.css` directly with lightningcss 1.33.0 produces no warnings. lightningcss 1.30.1 and 1.32.0 each produce one warning for the `::highlight` rule.

So the error comes from a `node_modules` installed before the 2026-10-06 Vite upgrade and never refreshed. Running `npm install` against the current lockfile fixes it. The stylesheet is correct and needs no change.

## Goal

Make the test suite fail if any web stylesheet stops minifying cleanly, whether a dependency regresses or someone adds syntax the minifier rejects, so the problem never shows up only as a build warning.

## Approach

Add a client-project test that walks every `.css` file under `web/src/`, minifies it with the installed lightningcss (the same library Vite's build uses), and asserts no warnings. A second assertion pins that the shell reply-selection `::highlight` rule survives minification.

## Implementation steps

1. Add `web/src/stylesheets-minify.test.ts`.

## Tests

- The stylesheet walk finds `plugins/shell/shell.css`, so the walk can't silently match nothing.
- Each web stylesheet minifies with no lightningcss warnings (one case per file).
- The minified `shell.css` still contains `::highlight(shell-reply-selection)`.

## Spec and docs

No behavior changes. `product/specs/shell-tab.md` already describes the reply-selection highlight. No help or user documentation describes the build.

## Out of scope

- Changing the CSS minifier (`build.cssMinify`) or moving the highlight rule into script. The current toolchain handles the rule.
- Adding a direct `lightningcss` dependency or an `overrides` floor in `package.json`. Vite's own `^1.33.0` range already sets the floor.
