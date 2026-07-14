# Markdown preview should respect the application theme

**Complexity: 2/10** — a CSS-variable swap in one rule block, directly modeled on an existing, already-themed twin ruleset (`.line.markdown`) that renders the identical HTML output from the same `renderMarkdown()` helper. No component or architecture changes.

## Goal

The markdown tab (`.markdown-stage`, `web/src/MarkdownTab.tsx`) currently hardcodes a white-paper look (`#fff` background, near-black text, light-blue selection) in every application theme. After this fix, the markdown tab picks up the active application theme's colors (background, text, links, code, blockquotes, tables, selection) exactly like the rest of the app chrome, instead of being a fixed white document in every theme.

## Approach

`web/src/theme.css` already contains a themed version of this exact markup: `.line.markdown` (lines 314–346) styles the same `renderMarkdown()` HTML output when it appears inline in the agent transcript, using theme CSS custom properties (`var(--fg)`, `var(--accent)`, `var(--bg-soft)`, `var(--border)`, `var(--muted)`) instead of hardcoded hex colors. `.markdown-stage` (lines 191–224) is structurally the same selector list (`h1`–`h6`, `p`, `a`, `code`, `pre`, `blockquote`, `hr`, `table`) but hardcodes colors instead. Replacing each hardcoded color in `.markdown-stage` with the matching theme variable used by `.line.markdown` makes the markdown tab theme-aware with no new variables except one: `::selection` currently hardcodes `#b3d4fc` with no themed equivalent anywhere, so it will reuse `var(--editor-selection)` (already defined per-theme, currently used for the code editor's selection highlight) as a shared color token — appropriate since both represent "selection highlight over themed content," even though `--editor-selection` is applied via a different mechanism (a class, not native `::selection`) in the editor.

## Implementation steps

1. `web/src/theme.css` — rewrite the `.markdown-stage` rule block (lines 191–224) to use theme variables in place of hardcoded colors, mirroring `.line.markdown`:
   - `background: var(--bg); color: var(--fg);` (was `#fff` / `#1a1a1a`)
   - `::selection { background: var(--editor-selection); }` (was `#b3d4fc`)
   - headings: `color: var(--fg)` (was `#1a1a1a`)
   - `a { color: var(--accent); }` (was `#1a6cbe`)
   - `code`, `pre`, `th` backgrounds: `var(--bg-soft)` (was `#f0f0f0`); `code`/`pre` text stays inherited (`var(--fg)`) instead of `#1a1a1a`
   - `blockquote`: `color: var(--muted); border-left-color: var(--border);` (was `#555` / `#ccc`)
   - `hr`, table borders: `var(--border)` (was `#ddd` / `#ccc`)
2. Update the doc-comment above `.markdown-stage` (currently "scrollable white-paper document area") to describe the themed behavior instead.

## Tests

No existing test in `web/src/MarkdownTab.test.tsx` asserts on color/background (it covers metadata header rendering, HTML injection, and scroll-key handling), so no test changes are required for the CSS swap itself — this is confirmed by reading the file. No new automated test is added: there is no existing color-assertion pattern for themed CSS elsewhere in the test suite (theme correctness for other elements, e.g. `.line.markdown`, is likewise not asserted in tests — it's a CSS-only concern verified visually).

## Spec updates

- `specs/application-themes.md` — the "Scope of theming" section states rendered markdown documents "keep their paper-white document background in every theme"; update to say markdown documents follow the active theme (keep the embedded-web-pages and ANSI-palette exceptions as still true).
- `specs/markdown-tab.md` — the "Appearance" section (lines 75–84) describes a fixed white-paper/near-black/light-blue-selection look; rewrite to describe theme-driven appearance (background, text, links, code, etc. follow the active application theme; selection remains visibly distinct from the background).
- `specs/open.md` — line 88 mentions the markdown tab rendering "on a white paper background with dark text"; update for consistency with the new themed behavior.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks affected projects, runs related web tests.
- Manual: not performed in this environment (no way to visually drive the Electron/web app here); the CSS variables used are already proven correct by `.line.markdown`, which renders the same HTML in the transcript today, so the swap is low-risk. Noted as unverified-by-eye in the final report.

## Out of scope

- Embedded web pages (`.page-frame`, `PageTab.tsx`) — spec explicitly keeps these paper-white; unrelated component, not touched.
- ANSI-colored shell output palette — spec explicitly keeps this outside theming; unrelated.
- Adding a dedicated `--selection` custom property per theme — reusing the existing `--editor-selection` token is sufficient and avoids touching all six theme blocks for a new variable.
