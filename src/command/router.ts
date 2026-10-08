import { messageBus } from '../bus.js';
import { routeChoices } from '../recognizers/route-choices.js';
import type { RouteChoice } from '../recognizers/types.js';
import { recognizeRoute } from '../route-choice.js';
import type { Managers } from '../managers.js';
import { acpAvailable } from '../acp/availability.js';

export function resolveUnknownCommand(
  cmd: string,
  label: string,
  managers: Managers,
  run: (input: string, label: string, index: number) => void,
  setPending: (pending: { label: string; cmd: string; choices: RouteChoice[] } | null) => void,
): void {
  const route = recognizeRoute(cmd, label, managers);
  if (route.kind === 'routed') {
    run(route.command, label, managers.tab.findIndex(label));
  } else {
    setPending({ label, cmd, choices: routeChoices(route.openDbs, acpAvailable(label, managers)) });
    messageBus.emit('state', { type: 'dirty' });
  }
}
