import type { Command } from './types.js';
import { getConfig, updateConfig } from '../config.js';
import { APP_THEMES } from '../app-themes.js';
import { SYNTAX_THEMES } from '../syntax-themes.js';

function listThemes(): string {
  const active = getConfig().theme;
  return APP_THEMES.map((name) => (name === active ? `* ${name}` : `  ${name}`)).join('\n');
}

// `theme sync`: set the syntax theme to the app theme's name, when a syntax theme by that exact
// name exists (the two name sets barely overlap today — only `nord` matches).
function syncSyntaxTheme(): string {
  const appTheme = getConfig().theme;
  const canonical = SYNTAX_THEMES.find((theme) => theme.toLowerCase() === appTheme.toLowerCase());
  if (!canonical) return `No syntax theme named "${appTheme}" exists — syntax theme unchanged.`;
  const persisted = updateConfig({ syntaxTheme: canonical });
  return persisted
    ? `Syntax theme set to "${canonical}".`
    : `Syntax theme set to "${canonical}" for this session (config write failed — won't persist).`;
}

function setTheme(name: string): string {
  const canonical = APP_THEMES.find((theme) => theme.toLowerCase() === name.toLowerCase());
  if (!canonical) return `Unknown theme "${name}". Available themes:\n${listThemes()}`;
  const persisted = updateConfig({ theme: canonical });
  return persisted
    ? `Theme set to "${canonical}".`
    : `Theme set to "${canonical}" for this session (config write failed — won't persist).`;
}

export const command: Command = {
  name: 'theme',
  match: (command_) => /^theme\b/i.test(command_),
  run: (command_, tab, managers) => {
    const rest = command_.replace(/^theme\b\s*/i, '').trim();
    if (!rest) {
      managers.tab.append(tab.label, { input: command_, output: `Available themes:\n${listThemes()}` });
      return;
    }
    const output = /^sync$/i.test(rest) ? syncSyntaxTheme() : setTheme(rest);
    managers.tab.append(tab.label, { input: command_, output });
  },
};
