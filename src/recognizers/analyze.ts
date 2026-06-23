import { bashRecognizer } from './bash.js';
import { dbRecognizer } from './db.js';
import { acpRecognizer } from './acp.js';
import type { CommandRecognizer, CommandRoute, RecognizerContext, RouteChoice } from './types.js';

export const recognizers: CommandRecognizer[] = [bashRecognizer, dbRecognizer, acpRecognizer];

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
export function analyzeCommand(cmd: string, ctx: RecognizerContext): AnalysisDecision {
  const matches: RouteResult[] = recognizers
    .map((r) => ({ route: r.route, ...r.recognize(cmd, ctx) }))
    .filter((r) => r.match)
    .map(({ route, reliability }) => ({ route, reliability }))
    .sort((a, b) => b.reliability - a.reliability);

  const top = matches[0];
  const runnerUp = matches[1];
  const confident =
    top !== undefined &&
    top.reliability >= HIGH_RELIABILITY &&
    (runnerUp === undefined || top.reliability - runnerUp.reliability >= DOMINANCE_MARGIN);

  if (confident) return { kind: 'route', route: top.route, reliability: top.reliability };
  return { kind: 'ambiguous', candidates: matches };
}

// The routes a user may pick from in the chooser. Always offers shell and acp; offers a db
// choice per open connection (the query needs a concrete database to target).
export function routeChoices(openDbs: string[]): RouteChoice[] {
  const choices: RouteChoice[] = [{ label: 'shell', route: 'shell' }];
  for (const db of openDbs) choices.push({ label: `db query → ${db}`, route: 'db', dbName: db });
  choices.push({ label: 'acp (agent prompt)', route: 'acp' });
  return choices;
}

// Rewrite a bare command into the explicit, prefixed form for `choice`'s route, so it can be
// dispatched through the normal command pipeline.
export function toPrefixedCommand(cmd: string, choice: RouteChoice): string {
  switch (choice.route) {
    case 'shell':
      return `shell ${cmd}`;
    case 'acp':
      return `acp ${cmd}`;
    case 'db':
      return `db sqlite query ${choice.dbName} ${cmd}`;
  }
}
