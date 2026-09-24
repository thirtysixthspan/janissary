import type { RemoteSessionView } from '../protocol.js';
import { resolveAgentName } from '../agent/commands.js';
import { POOL_EXHAUSTED, openTabRefusal, sessionsRowRefusal } from './messages.js';

// Whether a harness or agent launch may take the name it asked for, as a pure function of the open
// tab labels and the sessions rows the caller read (principle 4). An explicit name — one the user
// typed, or a profile entry's `name` — is refused on any clash. A default name — a bare harness
// name, or an unnamed agent's pool name — walks its candidate sequence to the first free one.

// The sessions-row fields the check reads, so a test can hand it plain data.
export type LaunchNameRow = Pick<RemoteSessionView, 'label' | 'kind' | 'state' | 'host'>;

export type LaunchNameRequest = {
  name: string;
  explicit: boolean;
  tabs: readonly string[];
  rows: readonly LaunchNameRow[];
  // A default name's sequence, in the order to try. Absent, the `uniqueLabel` suffix sequence of
  // `name` (`claude`, `claude-2`, …).
  candidates?: Iterable<string>;
  // Names a default must pass over whatever the tabs and rows say: the ones a remote host has
  // already reported running during this launch's retries.
  skip?: readonly string[];
  // A clash the tabs and rows cannot show — a local workspace a live process still holds. Returns
  // the full refusal line, or undefined when the name is free.
  running?: (name: string) => string | undefined;
  // The refusal when a default's sequence runs out. Only a finite pool can.
  exhausted?: string;
};

export type LaunchNameResult =
  | { accepted: true; name: string; moved: boolean }
  | { accepted: false; message: string };

// Only a harness or agent row can hold a name a new launch would take, and only while it is still
// something that could come back.
const CLASHING_KINDS = new Set<LaunchNameRow['kind']>(['harness', 'agent']);
const CLASHING_STATES = new Set<LaunchNameRow['state']>(['provisioning', 'active', 'reconnecting', 'detached']);

// Two names clash when they differ only by case. The workspace-running check uses the same rule,
// since a case-insensitive filesystem gives both names one folder.
export function sameLaunchName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// The refusal line for `name`, or undefined when nothing holds it.
export function clashOf(name: string, request: LaunchNameRequest): string | undefined {
  if (request.tabs.some((label) => sameLaunchName(label, name))) return openTabRefusal(name);
  const row = request.rows.find((candidate) => CLASHING_KINDS.has(candidate.kind)
    && CLASHING_STATES.has(candidate.state) && sameLaunchName(candidate.label, name));
  if (row) return sessionsRowRefusal(name, row.state, row.host);
  return request.running?.(name);
}

export function* suffixCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; ; n++) yield `${base}-${n}`;
}

// The agent-name pool in a random order, each name drawn by `resolveAgentName` from the ones not yet
// drawn. Taking the first free name from it is the same uniform pick among the free names an unnamed
// agent has always been given.
export function* poolCandidates(): Generator<string> {
  const drawn: string[] = [];
  for (let next = resolveAgentName('agent', drawn); next !== null; next = resolveAgentName('agent', drawn)) {
    drawn.push(next);
    yield next;
  }
}

export function checkLaunchName(request: LaunchNameRequest): LaunchNameResult {
  if (request.explicit) {
    const clash = clashOf(request.name, request);
    return clash === undefined ? { accepted: true, name: request.name, moved: false } : { accepted: false, message: clash };
  }
  const skip = request.skip ?? [];
  const candidates = request.candidates ?? suffixCandidates(request.name);
  for (const candidate of candidates) {
    if (skip.some((skipped) => sameLaunchName(skipped, candidate))) continue;
    if (clashOf(candidate, request) === undefined) {
      return { accepted: true, name: candidate, moved: !sameLaunchName(candidate, request.name) };
    }
  }
  return { accepted: false, message: request.exhausted ?? POOL_EXHAUSTED };
}
