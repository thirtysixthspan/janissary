# Full Application Color Themes

## Summary

Extend Janissary's theming system beyond editor/markdown syntax highlighting to cover the entire application chrome — tab strip, transcript colors, connections/schedule panel backgrounds, borders, and status indicators. A `theme` command selects from a small set of built-in named themes (dark, light, and a few popular palettes), applied instantly without restart. The picker UI mirrors the existing `syntax theme` picker for consistency.

## Decisions (to be confirmed with user)

1. **Theme model: cohesive palettes, not individual knobs.** Each theme defines a complete color palette (background, foreground, accent, border, status colors for state indicators, transcript prompt/output colors). Users select a theme by name, not by tweaking individual CSS variables. This keeps the surface simple and avoids the endless-tweak trap.
2. **Built-in themes, no custom themes (v1).** v1 ships with a curated set: `dark` (default, matches current appearance), `light`, `solarized-dark`, `solarized-light`, `nord`, `dracula`, `gruvbox-dark`. Custom CSS file loading is a v2 consideration.
3. **Storage: per-user config, not per-tab.** Theme is a global application setting, persisted in `.janissary/config.json` under a `theme` key. Changing it affects the entire window immediately — no per-tab theming.
4. **Independence from syntax themes.** `theme` controls application chrome. `syntax theme` continues to control editor/markdown tab syntax highlighting independently. The two compose: a user could have a `dark` app theme with a `github-light` syntax theme. A convenience `theme sync` command optionally sets the syntax theme to match the app theme.
5. **Picker UI: same modal pattern as syntax theme.** `Ctrl+Shift+T` opens the theme picker (mirroring `Ctrl+Shift+P` for syntax). The picker is a modal grid of colored swatches. `theme` with no arguments also opens it. `theme <name>` applies directly.

## Verified codebase facts that shape the design

- **Syntax theming already exists as a precedent.** `specs/application-config.md` documents `syntaxTheme` in `Config`. `ThemePicker.tsx` renders a swatch grid. `useThemePicker.ts` loads available themes from `themeRegistry.ts`. The full-app theme system copies this architecture.
- **CSS uses `theme.css` for all chrome styling.** `web/src/theme.css` defines colors for tab strip, transcript, borders, backgrounds, etc. Current theme is effectively hardcoded. To support swappable themes, the file must be refactored to use CSS custom properties (variables) driven by a `data-theme` attribute on the root element.
- **Config is runtime-mutable.** `specs/application-config.md` documents that config changes take effect immediately, rewriting the file. Adding a `theme` key follows the same pattern as `syntaxTheme`.
- **Client receives config on init via `StateEvent`.** `protocol.ts` already carries `config` (or at minimum `syntaxTheme`). Extending `StateEvent` to include the full `Config` object (or a `theme` string) means the client can set `data-theme` on mount without a server round-trip.

## Proposed changes

### 1. CSS refactor — custom properties

- Refactor `web/src/theme.css`: replace all hardcoded color values with CSS custom properties defined on a `[data-theme]` selector.
  - Property namespace: `--janus-bg`, `--janus-fg`, `--janus-accent`, `--janus-border`, `--janus-tab-active-bg`, `--janus-tab-active-fg`, `--janus-tab-inactive-bg`, `--janus-tab-inactive-fg`, `--janus-transcript-bg`, `--janus-transcript-prompt`, `--janus-transcript-output`, `--janus-transcript-message`, `--janus-panel-bg`, `--janus-panel-border`, `--janus-input-bg`, `--janus-input-fg`, `--janus-scrollbar-thumb`, `--janus-scrollbar-track`, `--janus-state-blocked`, `--janus-state-working`, `--janus-state-done`, `--janus-state-error`.
  - Each named theme (`[data-theme="dark"]`, `[data-theme="light"]`, …) sets these 20-ish variables under the root selector.
  - Color values for each theme are defined in a new `web/src/themes/` directory as TypeScript objects (one file per theme, e.g. `dark.ts`, `light.ts`), then compiled into CSS custom properties at build time or runtime via `document.documentElement.style.setProperty()`.
- `App.tsx` sets `document.documentElement.setAttribute('data-theme', theme)` on mount and on theme change.
- Build a small TypeScript utility (`web/src/themes/index.ts`) that exports a `ThemePalette` type and a `Map<string, ThemePalette>` registry, plus a `applyTheme(name: string)` function that writes the properties to the root element.

### 2. Config and protocol

- Add `theme: string` to `Config` (`src/types.ts`), defaulting to `"dark"`.
- `StateEvent` (`src/protocol.ts`): add `theme?: string` to the state payload. `ServerState` computed from `Config.theme`. The client uses this on first connect to set the initial theme.
- `src/commands/theme.ts`: new command module. `theme` with no args opens the picker (client-side dispatch via `state.route` / route chooser pattern); `theme <name>` validates against the registry and applies immediately, writing to config.
- Client-side `CommandInput.tsx`: intercept `theme` and `theme <name>` locally. `theme` with no args opens the picker; `theme <name>` sends an RPC to apply the theme server-side (so config persists). RPC: new `applyTheme` message (`{ method: 'applyTheme', params: { name: string } }`).

### 3. Web UI — theme picker

- New component `web/src/ThemeAppPicker.tsx` (distinct from `ThemePicker.tsx` for syntax themes, though sharing the grid-of-swatches layout):
  - Renders a grid of theme swatches (colored rectangles with theme name underneath).
  - Each swatch shows the theme's `--janus-bg` and `--janus-accent` colors as a preview.
  - Click selects the theme: calls `onSelect(name)` which dispatches `applyTheme` RPC.
  - Keyboard-navigable (arrows + Enter).
- Show the picker when `state.route` carries a new `theme` route type, or render locally when `theme` is typed with no args and handled in `CommandInput`.

### 4. `theme sync` command

- `theme sync` reads the current `Config.theme` and applies the same name to `Config.syntaxTheme` (if the syntax theme registry includes a matching name). Convenience shorthand so users don't need to remember two separate commands.

### 5. Specs

- New `specs/application-themes.md`: palette model (comprehensive preset, not individual knobs), theme registry, `theme` command syntax, picker UX, CSS custom property architecture, `theme sync` behavior, relationship to `syntax theme`.
- `specs/application-config.md`: add `theme` to the config table, document runtime swap behavior.
- `specs/application-commands.md`: add `theme` command.
- `specs/tabs.md`: note that state indicator colors are theme-driven.

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `web/src/themes/index.test.ts`: registry contains expected themes, `applyTheme` sets correct CSS properties on the root element.
- `web/src/ThemeAppPicker.test.tsx`: renders swatches for each theme, onSelect dispatches correct name.
- `src/commands/theme.test.ts`: validates theme names, rejects unknown names, writes config.
- `src/config-manager.test.ts` (or wherever Config is tested): default theme, round-trip write/read.
- Visual: manually verify each theme renders without contrast issues across all tab types (agent, harness, editor, viewer).

## Implementation order

1. Type model: `ThemePalette` type + theme registry (`web/src/themes/`), tests.
2. CSS refactor: custom properties in `theme.css`, `data-theme` attribute in `App.tsx`, tests.
3. Config + protocol: `Config.theme` + `StateEvent.theme`, server-side RPC handler, tests.
4. `theme` command: `src/commands/theme.ts`, tests.
5. Theme picker UI: `ThemeAppPicker.tsx` component + integration into `CommandInput`/route chooser, tests.
6. `theme sync` command.
7. Specs: new `application-themes.md` + amendments to config, commands, tabs.
8. Public documentation + screenshots (light theme documentation page).

Run `./scripts/run.mjs check-diff` after each step.
