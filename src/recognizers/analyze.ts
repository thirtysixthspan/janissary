import { bashRecognizer } from './bash.js';
import { dbRecognizer as databaseRecognizer } from './db.js';
import { acpRecognizer } from './acp.js';
import type { CommandRecognizer, CommandRoute, RecognizerContext } from './types.js';
export { routeChoices, toPrefixedCommand } from './route-choices.js';

export const recognizers: CommandRecognizer[] = [bashRecognizer, databaseRecognizer, acpRecognizer];

// A command is auto-dispatched only when the best match is at least this reliable and clearly
// ahead of the runner-up; otherwise the user is asked to choose.
export const HIGH_RELIABILITY = 0.7;
const DOMINANCE_MARGIN = 0.15;

export type RouteResult = { route: CommandRoute; reliability: number };

export type AnalysisDecision =
  // Confident: dispatch straight to this route.
  | { kind: 'route'; route: CommandRoute; reliability: number }
  // Unsure: present these candidates (most reliable first) for the user to pick from.
  | { kind: 'ambiguous'; candidates: RouteResult[] };

// Poll every recognizer and decide how to route the command. The highest-reliability match wins
// when it is confident enough; otherwise the result is ambiguous and the caller should prompt.
export function analyzeCommand(command: string, context: RecognizerContext): AnalysisDecision {
  const matches: RouteResult[] = recognizers
    .map((r) => ({ route: r.route, ...r.recognize(command, context) }))
    .filter((r) => r.match)
    .map(({ route, reliability }) => ({ route, reliability }))
    .toSorted((a, b) => b.reliability - a.reliability);

  const top = matches[0];
  const runnerUp = matches[1];
  const isConfident =
    top !== undefined &&
    top.reliability >= HIGH_RELIABILITY &&
    (runnerUp === undefined || top.reliability - runnerUp.reliability >= DOMINANCE_MARGIN);

  if (isConfident) return { kind: 'route', route: top.route, reliability: top.reliability };
  return { kind: 'ambiguous', candidates: matches };
}
