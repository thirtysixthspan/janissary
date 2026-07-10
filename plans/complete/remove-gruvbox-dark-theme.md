# Remove the gruvbox-dark theme

**Complexity: 2/10** — deleting one entry from a flat name array, one CSS block, and updating the one test that hardcodes the full theme list. Every other consumer (picker UI, `theme` command, config) iterates `APP_THEMES` dynamically, so nothing else needs to change.

## Goal

Remove `gruvbox-dark` from the set of built-in application themes. After this fix, `theme gruvbox-dark` is an unrecognized name, the theme picker no longer lists it, and no CSS palette for it ships.

## Approach

`src/app-themes.ts` is the single source of truth for theme names (`APP_THEMES`), shared by the server (config persistence, `theme` command validation) and the web client (picker list, `data-theme` values) via the `@shared` alias. `web/src/theme.css` holds the palette itself as a `[data-theme="gruvbox-dark"]` block. Removing the name from the array and the matching CSS block is sufficient — every consumer (`src/commands/theme.ts`, `web/src/AppThemePicker.tsx`, etc.) iterates `APP_THEMES` rather than hardcoding theme names, so no other source file references `gruvbox-dark`.

## Implementation steps

1. `src/app-themes.ts` — remove the `'gruvbox-dark',` line from the `APP_THEMES` array.
2. `web/src/theme.css` — remove the `[data-theme="gruvbox-dark"] { ... }` block (lines 116–132).

## Tests

- `src/app-themes.test.ts` — update the hardcoded expected array in the `'exports the built-in theme names'` test to drop `'gruvbox-dark'`, matching the new `APP_THEMES` contents.

No other test hardcodes theme names; picker and command tests iterate `APP_THEMES` and will reflect the removal automatically.

## Spec updates

- `specs/application-themes.md` — remove `gruvbox-dark` from the "Built-in themes" list.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks affected projects, runs related server + web tests.
- Manual: not applicable beyond automated tests — this is a static list/CSS removal with no interactive behavior change to exercise.

## Out of scope

- Any handling for a user who currently has `gruvbox-dark` persisted in their config — no existing theme has such a migration/fallback, and this fix does not introduce one for consistency with that existing behavior.
- `plans/complete/application-themes.md` — left as-is; it is a historical record of the original theme feature's implementation, not living documentation.
