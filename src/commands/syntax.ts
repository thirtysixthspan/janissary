import type { Command } from './types.js';
import { getConfig, updateConfig } from '../config.js';
import { SYNTAX_THEMES } from '../syntax-themes.js';
import { appendCommandOutput } from '../command/append.js';

const USAGE = 'Usage: syntax theme [name]';

function listThemes(): string {
  const active = getConfig().syntaxTheme;
  return SYNTAX_THEMES.map((name) => (name === active ? `* ${name}` : `  ${name}`)).join('\n');
}

export const command: Command = {
  name: 'syntax',
  match: (command_) => /^syntax\b/i.test(command_),
  samples: ['syntax', 'syntax github-dark'],
  run: (command_, tab, managers, invocation) => {
    const rest = command_.replace(/^syntax\b\s*/i, '').trim();
    if (!/^theme\b/i.test(rest)) {
      appendCommandOutput(managers, tab.label, { input: command_, output: USAGE }, invocation);
      return;
    }
    const name = rest.replace(/^theme\b\s*/i, '').trim();
    if (!name) {
      appendCommandOutput(managers, tab.label, { input: command_, output: `Available themes:\n${listThemes()}` }, invocation);
      return;
    }
    const canonical = SYNTAX_THEMES.find((theme) => theme.toLowerCase() === name.toLowerCase());
    if (!canonical) {
      appendCommandOutput(managers, tab.label, {
        input: command_,
        output: `Unknown theme "${name}". Available themes:\n${listThemes()}`,
      }, invocation);
      return;
    }
    const persisted = updateConfig({ syntaxTheme: canonical });
    const output = persisted
      ? `Syntax theme set to "${canonical}".`
      : `Could not save syntax theme "${canonical}" to .janissary/config.json — syntax theme unchanged.`;
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
