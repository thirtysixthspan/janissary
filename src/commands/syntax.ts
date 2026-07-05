import type { Command } from './types.js';
import { getConfig, updateConfig } from '../config.js';
import { SYNTAX_THEMES } from '../syntax-themes.js';

const USAGE = 'Usage: syntax theme [name]';

function listThemes(): string {
  const active = getConfig().syntaxTheme;
  return SYNTAX_THEMES.map((name) => (name === active ? `* ${name}` : `  ${name}`)).join('\n');
}

export const command: Command = {
  name: 'syntax',
  match: (command_) => /^syntax\b/i.test(command_),
  run: (command_, tab, managers) => {
    const rest = command_.replace(/^syntax\b\s*/i, '').trim();
    if (!/^theme\b/i.test(rest)) {
      managers.tab.append(tab.label, { input: command_, output: USAGE });
      return;
    }
    const name = rest.replace(/^theme\b\s*/i, '').trim();
    if (!name) {
      managers.tab.append(tab.label, { input: command_, output: `Available themes:\n${listThemes()}` });
      return;
    }
    const canonical = SYNTAX_THEMES.find((theme) => theme.toLowerCase() === name.toLowerCase());
    if (!canonical) {
      managers.tab.append(tab.label, {
        input: command_,
        output: `Unknown theme "${name}". Available themes:\n${listThemes()}`,
      });
      return;
    }
    const persisted = updateConfig({ syntaxTheme: canonical });
    const output = persisted
      ? `Syntax theme set to "${canonical}".`
      : `Syntax theme set to "${canonical}" for this session (config write failed — won't persist).`;
    managers.tab.append(tab.label, { input: command_, output });
  },
};
