// Names of the application color themes available for `theme <name>`. Shared between the server
// (persisted config, command validation) and the web client (picker list, `data-theme` values) via
// the `@shared` alias, so this file must stay free of Node imports. The palettes themselves live
// only in web/src/theme.css as `[data-theme="<name>"]` blocks.
export const APP_THEMES: string[] = [
  'dark',
  'light',
  'solarized-dark',
  'solarized-light',
  'nord',
  'dracula',
  'gruvbox-dark',
];

export const DEFAULT_APP_THEME = 'dark';
