# Full Application Color Themes

**Complexity: 5/10** — new subsystem spanning config, protocol, a new command module, and a CSS/picker rework across ~6 files, but each piece follows an existing precedent (`syntax theme`) closely, and no new RPC or route mechanism is needed.

## Summary

Extend Janissary's theming system beyond editor/markdown syntax highlighting to cover the entire application chrome — tab strip, transcript colors, connections/schedule panel backgrounds, borders, and status indicators. A `theme` command selects from a small set of built-in named themes (dark, light, and a few popular palettes), applied instantly without restart. The picker UI mirrors the existing `syntax theme` picker for consistency.

## Decisions (to be confirmed with user)

1. **Theme model: cohesive palettes, not individual knobs.** Each theme defines a complete color palette (background, foreground, accent, border, status colors for state indicators, transcript prompt/output colors). Users select a theme by name, not by tweaking individual CSS variables. This keeps the surface simple and avoids the endless-tweak trap.
2. **Built-in themes, no custom themes (v1).** v1 ships with a curated set: `dark` (default, matches current appearance), `light`, `solarized-dark`, `solarized-light`, `nord`, `dracula`, `gruvbox-dark`. Custom CSS file loading is a v2 consideration.
3. **Storage: per-user config, not per-tab.** Theme is a global application setting, persisted in `.janissary/config.json` under a `theme` key. Changing it affects the entire window immediately — no per-tab theming.
4. **Independence from syntax themes.** `theme` controls application chrome. `syntax theme` continues to control editor/markdown tab syntax highlighting independently. The two compose: a user could have a `dark` app theme with a `github-light` syntax theme. A convenience `theme sync` command optionally sets the syntax theme to match the app theme.
5. **Picker UI: same interaction pattern as `syntax theme`, but with color swatches.** No keyboard shortcut exists for opening the *syntax* theme picker today — there is no `Ctrl+Shift+P` binding anywhere in `web/src` (grepped for it); the `syntax theme` picker opens only by typing `syntax theme` with no argument, handled by a local string comparison in `App.tsx` (see below). This plan follows the same convention: `theme` with no arguments opens the picker; there is no new keyboard shortcut. `theme <name>` applies directly. Unlike `ThemePicker.tsx` (plain text rows with a `✓` marker, no color preview — see "What already exists" below), the new app-theme picker does render color swatches, since the whole point is to preview a palette.

## Verified codebase facts that shape the design

- **Syntax theming already exists as a precedent, but not the way this plan originally assumed.** `Config` (`src/types.ts:419-427`) has `syntaxTheme: string`. The theme *names* live in `src/syntax-themes.ts` as a flat `SYNTAX_THEMES: string[]` (plus `DEFAULT_SYNTAX_THEME`), imported by both server and client through the `@shared/*` path alias (`web/tsconfig.json:13` maps `@shared/*` → `../src/*`) — there is no `themeRegistry.ts` and no per-theme color data in TypeScript at all; `SYNTAX_THEMES` is just names, because syntax highlighting itself is handled by the highlighting library, not app CSS. `ThemePicker.tsx` renders plain text rows (`✓ name` / `  name`), **not** a swatch grid — there is no color preview anywhere in the existing picker. `useThemePicker.ts` (`web/src/useThemePicker.ts`) holds only open/selected-index state and calls `runCommand('syntax theme ' + name)` on pick — it does not "load available themes from a registry" beyond importing `SYNTAX_THEMES` directly.
- **The picker opens via a plain string match in `App.tsx`, not a route.** `App.tsx`'s `CommandArea` `onSubmit` handler does `const trimmed = text.trim().toLowerCase(); if (trimmed === 'syntax theme') openThemePicker();` (`web/src/App.tsx` ~line 210) before falling through to `runCommand(text)`. There is no dedicated `CommandInput.tsx` interception (that file is the dumb text-input widget only) and no `state.route` involvement — `route` is a separate, unrelated mechanism (`RouteChooserView`) used elsewhere.
- **Applying a theme goes through the existing generic `command` RPC — no new RPC needed.** `RpcCall` (`src/protocol.ts`) already has `{ method: 'command'; params: { text: string } }`, which is exactly what `runCommand` sends and what `src/commands/syntax.ts` handles server-side via `Command.run`. `theme <name>` should be a new entry in that same command dispatch table (see `src/commands/index.ts` for how commands are registered), not a bespoke `applyTheme` RPC method.
- **`theme.css` already uses CSS custom properties — just for one theme, and not scoped by `data-theme`.** `web/src/theme.css:1-10` defines 8 custom properties (`--bg`, `--bg-soft`, `--fg`, `--muted`, `--faint`, `--border`, `--accent`, `--mono`) on a bare `:root` selector, used throughout the file via `var(--x)`. The file's opening comment ("Tokens mirror `src/theme.ts` (darkTheme)") refers to a file that no longer exists in the repo (removed at some point after `c9f0d6c`); treat that comment as stale, not as a real module to reuse. There is currently no `data-theme` attribute set anywhere in `web/src` — `document.documentElement` theme scoping does not exist yet. The refactor this plan needs is: (a) scope the existing 8 variables under `[data-theme="dark"]` instead of `:root`, (b) add the ~12 additional variables the new surfaces need, (c) add a variant block per additional theme, (d) set `data-theme` on `<html>` or `#root` on mount/change. This is smaller than "replace all hardcoded values" — most of `theme.css`'s 392 lines already reference `var(--x)` and don't change at all.
- **Config is runtime-mutable.** `specs/application-config.md` documents that config changes take effect immediately, rewriting the file. `src/config.ts` exports `getConfig()`/`updateConfig(partial)`; `src/commands/syntax.ts` calls `updateConfig({ syntaxTheme: canonical })` directly as its persistence step — `theme.ts` does the same with `updateConfig({ theme: canonical })`.
- **Client receives the syntax theme on init via a flat `StateEvent` field, not a nested `config` object.** `StateEvent` (`src/protocol.ts:69-74`) is `{ t: 'state'; tabs; activeTab; route; tabNameMaxLength; globalHistory; syntaxTheme: string }` — there is no `config` field on the wire at all. The new `theme` field should be added the same way: a sibling `theme: string` on `StateEvent`, not a nested object.

## Proposed changes

### What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Theme name list, shared server/client | `SYNTAX_THEMES: string[]` + `DEFAULT_SYNTAX_THEME` over `@shared/*` | `src/syntax-themes.ts` |
| Config field + persistence | `syntaxTheme: string` on `Config`, `updateConfig({ syntaxTheme })` | `src/types.ts:419-427`, `src/config.ts` |
| Wire field for initial value | `syntaxTheme: string` on `StateEvent` | `src/protocol.ts:69-74` |
| Command module shape | `Command` with `match`/`run`, registered in the command table | `src/commands/syntax.ts`, `src/commands/index.ts:24,50` |
| Applying a command from the client | generic `{ method: 'command'; params: { text } }` RPC via `runCommand` | `src/protocol.ts` `RpcCall` |
| No-args-opens-picker convention | local string match in `onSubmit`, not a route | `web/src/App.tsx` ~line 210 |
| Picker open/select state as a hook | `useThemePicker.ts` (index state + open/close + pick-and-run) | `web/src/useThemePicker.ts` |
| CSS custom properties | 8 vars already on `:root` (`--bg`, `--bg-soft`, `--fg`, `--muted`, `--faint`, `--border`, `--accent`, `--mono`) | `web/src/theme.css:1-10` |

### 1. Theme name list and config

- New `src/app-themes.ts` (sibling to `src/syntax-themes.ts`, same shape): `export const APP_THEMES: string[] = ['dark', 'light', 'solarized-dark', 'solarized-light', 'nord', 'dracula', 'gruvbox-dark']` and `export const DEFAULT_APP_THEME = 'dark'`. No color data here — colors live only in CSS (see step 3). Keeping this a flat name list, not a `Map<string, Palette>`, mirrors `syntax-themes.ts` exactly and avoids maintaining color values in two places (TS and CSS) that could drift.
- Add `theme: string` to `Config` (`src/types.ts`, next to the existing `syntaxTheme` field), defaulting to `DEFAULT_APP_THEME`. Follow the same doc-comment convention as `syntaxTheme`.
- `StateEvent` (`src/protocol.ts:69-74`): add `theme: string` as a required sibling field to `syntaxTheme` (not optional — `syntaxTheme` isn't optional either, and the server always has a value from `Config`).

### 2. `theme` command

- New `src/commands/theme.ts`, modeled directly on `src/commands/syntax.ts`: `theme` with no args lists available themes (marking the active one), matching the `listThemes()` pattern; `theme <name>` validates case-insensitively against `APP_THEMES`, calls `updateConfig({ theme: canonical })`, and reports success/failure exactly like `syntax.ts` does for a failed config write. Register it in `src/commands/index.ts` next to `syntax` (`import { command as theme } from './theme.js'`, add `theme,` to the export list).
- No new RPC method. `theme <name>` reaches the server the same way `syntax theme <name>` does: the client calls `runCommand(text)`, which sends the existing `{ method: 'command', params: { text } }` RPC; the server-side `theme.ts` command handles persistence. There is no `applyTheme` RPC to add.
- Client-side "no args opens picker" follows the existing convention: in `App.tsx`'s `CommandArea` `onSubmit` (same block as the `trimmed === 'syntax theme'` check), add `else if (trimmed === 'theme') openAppThemePicker();`. This requires a new hook mirroring `useThemePicker.ts` — see step 4 — not a change to `CommandInput.tsx` (that component has no knowledge of command semantics; it just reports submitted text upward).

### 3. CSS — theme variants

- Refactor `web/src/theme.css`: move the 8 existing custom properties from `:root` to `[data-theme="dark"]`, and add the additional properties the new surfaces need (tab strip, transcript, panels, status indicators) under the same block. Reuse the existing unprefixed names (`--bg`, `--fg`, `--accent`, etc.) for the new variables too, rather than introducing a `--janus-` prefix — nothing else in the file is prefixed, and mixing conventions inside one file adds no value.
- Add one `[data-theme="<name>"] { ... }` block per additional theme (`light`, `solarized-dark`, `solarized-light`, `nord`, `dracula`, `gruvbox-dark`), each setting the full set of variables. This is plain CSS — no TypeScript color objects, no `document.documentElement.style.setProperty()` compilation step. The browser's cascade does the work once `data-theme` is set on an ancestor element.
- `App.tsx` sets `document.documentElement.dataset.theme = theme` on mount (from the initial `StateEvent.theme`) and whenever the value changes after a `theme <name>` command updates local state from a later `StateEvent`.
- Swatch preview (see step 4) needs each theme's representative colors without duplicating them in TypeScript: render each swatch inside its own small wrapper carrying `data-theme={name}`, then have the swatch's background/accent use `var(--bg)` / `var(--accent)` as inline styles. Because `data-theme` is scoped to the wrapper, the CSS cascade resolves each swatch to its own theme's colors automatically, with no color data outside `theme.css`.

### 4. Web UI — theme picker

- New hook `web/src/useAppThemePicker.ts`, mirroring `useThemePicker.ts`'s shape (open state, selected index, `openAppThemePicker`, `pickAppTheme` that calls `runCommand('theme ' + name)` and closes).
- New component `web/src/AppThemePicker.tsx` (distinct from `ThemePicker.tsx`, which stays syntax-only and unchanged): renders one row per `APP_THEMES` entry, each row containing a small swatch (per the `data-theme`-scoped technique in step 3) and the theme name, with the active theme marked the same way `ThemePicker.tsx` marks it (`✓`/blank prefix). Keyboard navigation (arrows + Enter, Escape to close) follows `ThemePicker.tsx`'s existing behavior — that logic currently lives in `App.tsx`'s key handler alongside the `hist`/`syntax theme` pickers, so extend that same handler rather than duplicating key-handling inside the new component.
- Wire into `App.tsx` next to the existing `themePickerOpen && <ThemePicker .../>` block: `!route && appThemePickerOpen && <AppThemePicker .../>`, and add `appThemePickerOpen` to the `pickerOpen` union passed to `CommandArea` so the input area suppresses submission while the picker is open (same pattern the existing pickers use).
- `App.tsx` is currently 231 lines, at or near the 200-line guideline already; adding this picker's wiring inline risks tripping `max-lines`. Keep the new state and handlers inside `useAppThemePicker.ts` (per above) so `App.tsx` only gains a few lines of JSX and one hook call, matching how `useThemePicker.ts` was already extracted for the same reason.

### 5. `theme sync` command

- Extend `src/commands/theme.ts`'s `match`/`run` to recognize `theme sync` as a subcommand (checked before the bare-name branch, same way `syntax.ts` checks for `theme\b` before treating the remainder as a name). Reads `getConfig().theme`, and if `SYNTAX_THEMES` (from `src/syntax-themes.ts`) contains a case-insensitive match for that name, calls `updateConfig({ syntaxTheme: canonical })`; otherwise reports that no matching syntax theme exists. Decision: matching is by exact name only (e.g. `dark` app theme → `dark`... but `SYNTAX_THEMES` has no theme literally named `dark`, only `github-dark` etc.) — since the two name sets don't overlap today, `theme sync` will typically report "no matching syntax theme" until a future syntax theme is added with a matching name, or until app/syntax theme names are deliberately aligned. State this limitation in the spec rather than trying to invent a fuzzy-matching scheme.

### 6. Specs

- New `specs/application-themes.md`: palette model (comprehensive preset, not individual knobs), `APP_THEMES` name list, `theme` command syntax (bare list, `theme <name>`, `theme sync`), picker UX, CSS custom property architecture (`[data-theme]` blocks, no TS color objects), relationship to `syntax theme` including the `theme sync` name-overlap limitation above.
- `specs/application-config.md`: add `theme` to the config table, document runtime swap behavior (mirrors the existing `syntaxTheme` row).
- `specs/application-commands.md`: add `theme` command (mirrors the existing `syntax` entry).
- `specs/tabs.md`: note that state indicator colors are theme-driven.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/app-themes.test.ts`: exports the expected name list and default (mirrors any existing `syntax-themes.test.ts` if one exists — otherwise keep it minimal, one assertion per exported value).
- `src/commands/theme.test.ts`: modeled on `src/commands/syntax.test.ts` — validates theme names case-insensitively, rejects unknown names with the available-themes listing, writes config via `updateConfig`, and covers `theme sync` (matching and non-matching cases).
- `src/config.test.ts`: extend with `theme` cases parallel to the existing `syntaxTheme` cases (default value, round-trip write/read, persistence across reload) — this is the real file (verified: `syntaxTheme` assertions live at `src/config.test.ts:24,31,105-137`), not `config-manager.test.ts`.
- `web/src/useAppThemePicker.test.ts` and/or `web/src/AppThemePicker.test.tsx`: open/select/close state transitions, swatch renders once per `APP_THEMES` entry, picking dispatches `theme <name>` via `runCommand`. Check `web/src/ThemePicker.test.tsx` for the existing test shape to mirror.
- Visual: manually verify each theme renders without contrast issues across all tab types (agent, harness, editor, viewer) — this is not automatable and must stay a manual verification step, not a test file.

## Implementation order

Land in an order that keeps `check-diff` green at each step and avoids a half-wired command:

1. `src/app-themes.ts` + tests.
2. `Config.theme` (`src/types.ts`) + `StateEvent.theme` (`src/protocol.ts`) + `src/config.ts` default wiring + `src/config.test.ts` additions. Do this before the command so `updateConfig({ theme })` type-checks.
3. `src/commands/theme.ts` (including `theme sync`) + registration in `src/commands/index.ts` + tests. At this point `theme <name>` is fully usable from the command line even with no CSS/picker changes yet — a safe intermediate checkpoint.
4. CSS: scope existing variables under `[data-theme="dark"]`, add the new variables, add the remaining theme variant blocks in `theme.css`. Verify visually that `dark` is unaffected (default, no `data-theme` set on the DOM yet).
5. `App.tsx`: set `document.documentElement.dataset.theme` from `StateEvent.theme` on mount and on update.
6. `useAppThemePicker.ts` + `AppThemePicker.tsx` + wiring into `App.tsx` (submit interception, render, key handling, `pickerOpen` union) + tests.
7. Specs: new `application-themes.md` + amendments to `application-config.md`, `application-commands.md`, `tabs.md`.
8. Public documentation + screenshots (light theme documentation page).

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Custom/user-defined themes (loading arbitrary CSS or color files) — v2, per Decision 2.
- A keyboard shortcut for the app-theme picker — no such shortcut exists for `syntax theme` either; adding one for only the new picker would be inconsistent (see Decision 5).
- Per-tab or per-workspace theming — Decision 3 makes this a single global setting.
- Automatically reconciling `theme` and `syntaxTheme` names beyond the explicit `theme sync` command (no auto-sync on `theme <name>`).

## Verification

- Run `./scripts/run.mjs check-diff` after each implementation step (lint, incremental typecheck, and affected tests for both `src/` and `web/src/` changes).
- Manual end-to-end check: start the app, run `theme` to confirm the picker lists all seven themes with `dark` marked active, arrow through and pick `light` — confirm the tab strip, transcript, and status-indicator colors all update immediately with no restart; run `theme nord` directly and confirm the same; run `theme sync` and confirm it reports whether a matching syntax theme was found; reload the app and confirm the picked theme persisted via `.janissary/config.json`.
