# Application Themes

The entire application chrome — tab strip, transcript colors, connections/schedule panel backgrounds, borders, pickers, dialogs, editor chrome, and status indicators — is colored by a named application theme. A theme is a complete, curated palette selected by name; individual colors cannot be tweaked.

### Built-in themes

`dark` (the default, matching the application's original appearance), `light`, `solarized-dark`, `solarized-light`, `nord`, `dracula`, and `gruvbox-dark`. There are no custom or user-defined themes.

### The `theme` command

- `theme <name>` applies a theme immediately, with no restart, and persists it to the application config (`theme` key in `.janissary/config.json`) so it survives a restart. Names are matched case-insensitively. An unrecognized name shows an error listing the available themes with the active one marked.
- Bare `theme` opens a picker overlay listing every theme, each row showing a small swatch of that theme's own background, foreground, and accent colors alongside its name, with the active theme marked with a `✓`. Up/Down move the selection, Return applies the selected theme, Escape closes, and a row can be clicked. The interaction mirrors the `syntax theme` picker; there is no keyboard shortcut to open it.
- `theme sync` sets the syntax-highlighting theme to the app theme's name when a syntax theme with exactly that name exists, and otherwise reports that no matching syntax theme exists, leaving the syntax theme unchanged. The two name sets barely overlap (only `nord` exists in both today), so sync typically reports no match.

### Relationship to syntax themes

The application theme and the syntax-highlighting theme (`syntax theme <name>`, see `application-commands.md`) are independent settings: the app theme colors the window chrome, the syntax theme colors code in editor tabs. Any combination is valid — e.g. a `dark` app theme with a `github-light` syntax theme. Nothing reconciles them automatically; `theme sync` is the only, explicit, bridge.

### Scope of theming

The theme applies globally to the whole window — there is no per-tab or per-workspace theming. Deliberately outside the theme: rendered markdown documents and embedded web pages keep their paper-white document background in every theme, and ANSI-colored shell output keeps the standard 16-color terminal palette. Tab dot colors are assigned per tab (to tell tabs apart) and are not part of the theme; status indicator colors (the running-command highlight, editor saved/error notices, search-hit highlight) are theme-driven.
