import { messageBus } from './bus.js';
import { analyzeCommand, toPrefixedCommand, routeChoices } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import type { Managers } from './managers.js';

export function resolveUnknownCommand(
  cmd: string,
  label: string,
  managers: Managers,
  run: (input: string, label: string, index: number) => void,
  setPending: (pending: { label: string; cmd: string; choices: RouteChoice[] } | null) => void,
): void {
  const openDbs = managers.database.openDbs(label);
  const decision = analyzeCommand(cmd, { openDbs });
  if (decision.kind === 'route' && (decision.route !== 'db' || openDbs.length === 1)) {
    const choice: RouteChoice = decision.route === 'db'
      ? { label: '', route: 'db', dbName: openDbs[0] }
      : { label: '', route: decision.route };
    run(toPrefixedCommand(cmd, choice), label, managers.tab.findIndex(label));
  } else {
    setPending({ label, cmd, choices: routeChoices(openDbs) });
    messageBus.emit('state', { type: 'dirty' });
  }
}
