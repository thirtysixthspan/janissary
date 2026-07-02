import { getOutput } from './commands.js';
import { analyzeCommand, toPrefixedCommand } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import type { Managers } from './managers.js';

export function routeUnknownCommand(
  text: string,
  trimmed: string,
  label: string,
  managers: Managers,
  run: (label: string, text: string, callback: (out: string) => void) => void,
  callback: (out: string) => void,
): void {
  const output = getOutput(trimmed);
  if (output !== null && !output.startsWith('Unknown command:')) {
    managers.tab.append(label, { input: text, output, markdown: trimmed === 'help' });
    callback(output);
    return;
  }

  const openDbs = managers.database.openDbs(label);
  const decision = analyzeCommand(trimmed, { openDbs });
  if (decision.kind === 'route' && (decision.route !== 'db' || openDbs.length === 1)) {
    const choice: RouteChoice = decision.route === 'db'
      ? { label: '', route: 'db', dbName: openDbs[0] }
      : { label: '', route: decision.route };
    run(label, toPrefixedCommand(trimmed, choice), callback);
    return;
  }
  callback(output ?? `Unknown command: "${trimmed}".`);
}
