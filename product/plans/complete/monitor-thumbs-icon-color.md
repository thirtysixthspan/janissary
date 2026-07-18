# Monitor tab thumbs up/down icons should use the theme foreground color, not the browser default

**Complexity: 1/10** — pure CSS rule addition in `web/src/theme.css`.

## Goal

The monitor tab's suggestion rows each carry a thumbs-up ("Helpful") and thumbs-down ("Not helpful") rating button (`web/src/MonitorTab.tsx:67-68`, `.monitor-suggestion .rate button`). Per the backlog, these icons currently render dark and should render white instead.

## Background (verified)

- `.monitor-suggestion .rate button` (`web/src/theme.css:549-552`) sets `background: transparent; border: none; cursor: pointer; font-size: 12px; padding: 0 2px; opacity: 0.35;` but sets **no `color`**.
- Every sibling button rule in this file (`.monitor-snapshot`/`.monitor-reset`, `.files-collapse-all`/`.files-dock-cycle`) explicitly sets `color: var(--muted)` (or `var(--fg)`), because native `<button>` elements do not inherit surrounding text color by default — without an explicit `color`, they render in the browser/OS's default button text color (effectively black/dark), regardless of the active theme.
- The app ships multiple themes (default dark, light, solarized dark/light, nord, dracula — see `web/src/theme.css:1-110`), each defining `--fg` as that theme's primary foreground color. In the default dark theme `--fg` is `#e4e5e7`, a near-white — matching what the issue calls "white." Using `var(--fg)` (rather than a literal `white`) keeps the icons legible and theme-correct across every theme, including the light ones, instead of hardcoding a color that would be invisible against a light background.

## Approach

Add `color: var(--fg);` to the existing `.monitor-suggestion .rate button` rule — the same fix pattern as `monitor-button-style-match.md` (an existing plan for a sibling button-styling gap in this file).

## Implementation steps

1. **`web/src/theme.css`** — change:
   ```css
   .monitor-suggestion .rate button {
     background: transparent; border: none; cursor: pointer;
     font-size: 12px; padding: 0 2px; opacity: 0.35;
   }
   ```
   to:
   ```css
   .monitor-suggestion .rate button {
     background: transparent; border: none; cursor: pointer; color: var(--fg);
     font-size: 12px; padding: 0 2px; opacity: 0.35;
   }
   ```

## Tests

No new automated tests — this is a pure CSS visual-styling fix with no behavioral or DOM-structure change; the buttons' presence, labels, click handlers, and icon glyphs are already covered by `web/src/MonitorTab.test.tsx`'s existing rate-button tests (`:120`, `:127`, `:137`), none of which assert on computed color (jsdom does not apply this stylesheet during tests).

## Spec updates

- Checked `product/specs/monitoring.md` for a description of the rating buttons' color — it describes their presence and behavior only, not their color, so no spec text needs updating.

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither documents the rating buttons' appearance. No documentation update needed.

## Verification

- `./scripts/run.mjs check-diff` — lints the changed CSS file and runs the related web tests (unaffected, confirming no regression).
- Manual: run the web app, open a monitor tab with suggestions, and visually confirm the thumbs-up/down icons render in the theme foreground color instead of the browser default dark button color. Not runnable in this environment — noting as unverified manually.

## Out of scope

- The buttons' `opacity: 0.35` idle state or the `:hover { opacity: 1 }` rule — unrelated to color, left unchanged.
- Any other button in the monitor tab or elsewhere — only the rating buttons are affected by this issue.
