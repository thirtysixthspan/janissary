import { analyzeCommand, toPrefixedCommand } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import type { Managers } from './managers.js';

// Whether `input` resolves to a route (and if so, which one). A bare 'db' target auto-resolves
// when exactly one db is open — the caller only needs to prompt when there's a real ambiguity.
export function resolveRouteChoice(input: string, openDbs: string[]): RouteChoice | undefined {
  const decision = analyzeCommand(input, { openDbs });
  if (decision.kind !== 'route' || (decision.route === 'db' && openDbs.length !== 1)) return undefined;
  return decision.route === 'db'
    ? { label: '', route: 'db', dbName: openDbs[0] }
    : { label: '', route: decision.route };
}

export type RecognizedRoute =
  | { kind: 'routed'; command: string }
  | { kind: 'unrouted'; openDbs: string[] };

// The step both unknown-command routers share: recognize a route for `cmd` against the tab's open
// databases. Each caller keeps its own fallback when nothing fits.
export function recognizeRoute(cmd: string, label: string, managers: Managers): RecognizedRoute {
  const openDbs = managers.database.openDbs(label);
  const choice = resolveRouteChoice(cmd, openDbs);
  return choice ? { kind: 'routed', command: toPrefixedCommand(cmd, choice) } : { kind: 'unrouted', openDbs };
}
