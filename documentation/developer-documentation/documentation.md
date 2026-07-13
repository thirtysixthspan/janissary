# Documentation

This site is a [VitePress](https://vitepress.dev) site (content conventions in `ai/guidelines/user-documentation.md` for the User Docs section, `ai/guidelines/developer-documentation.md` for this section):

```bash
npm run docs:dev       # local dev server with live reload
npm run docs:build     # static build → documentation/.vitepress/dist/
npm run docs:preview   # serve the built site locally
```

## Screenshots

The screenshots on the User Docs pages are generated, not hand-taken: a manifest (`scripts/docs-screenshots/manifest.mjs`) drives the real app against fixture data with Playwright and writes PNGs to `documentation/public/screenshots/`:

```bash
npm run build:web                      # captures show the built web UI — build it first
npm run playwright:install-chromium    # one-time, if Chromium isn't installed yet
./scripts/run.mjs docs-screenshots     # regenerate every shot (or pass specific shot names)
```

The script is host-only (sandboxed workspaces can't reach Playwright's browser cache). When a UI change alters what a screenshot shows, regenerate and commit the PNGs in the same PR — same rule as any other doc change. Shots that need a harness binary (e.g. `claude`) are skipped with a warning when it isn't on `PATH`.
