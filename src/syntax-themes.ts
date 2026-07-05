// Names of the syntax-highlighting themes available for `syntax theme <name>`. Shared between the
// server (persisted config, command validation) and the web client (theme CSS lookup) via the
// `@shared` alias, so this file must stay free of Node imports.
export const SYNTAX_THEMES: string[] = [
  'github-dark',
  'github',
  'atom-one-dark',
  'atom-one-light',
  'monokai',
  'nord',
  'vs2015',
  'tokyo-night-dark',
];

export const DEFAULT_SYNTAX_THEME = 'github-dark';
