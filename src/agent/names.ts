import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import defaultNames from '../../agent-names.json' with { type: 'json' };
import { workspaceLabelError } from '../workspace/label.js';
import { isValidAgentName } from './state.js';

export let agentNames: string[] = defaultNames;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

// A drawn name becomes a tab label, a workspace folder, and a state-file stem, so an override is
// held to the same bar as the bundled list: lowercase, unique, and safe as one folder and one stem.
// Any entry that cannot be made so rejects the whole file, the same way invalid JSON does.
export function decodeAgentNames(value: unknown): string[] | undefined {
  if (!isStringList(value) || value.length === 0) return undefined;
  const names = [...new Set(value.map((entry) => entry.toLowerCase()))];
  const unsafe = names.some((name) => workspaceLabelError(name) !== undefined || !isValidAgentName(name));
  return unsafe ? undefined : names;
}

// Reads `.janissary/agent-names.json` from the project directory and, when present and valid,
// uses it in place of the bundled name list for the rest of this run — the same load-with-fallback
// contract as `config.ts`'s `.janissary/config.json`.
export function loadAgentNames(projectDirectory: string): void {
  const overridePath = path.join(projectDirectory, '.janissary', 'agent-names.json');
  if (!existsSync(overridePath)) { agentNames = defaultNames; return; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(overridePath, 'utf8'));
  } catch {
    process.stderr.write('warning: .janissary/agent-names.json is invalid JSON — using the bundled name list\n');
    agentNames = defaultNames;
    return;
  }
  const decoded = decodeAgentNames(parsed);
  if (decoded === undefined) {
    process.stderr.write('warning: .janissary/agent-names.json is not a non-empty list of valid agent names — using the bundled name list\n');
  }
  agentNames = decoded ?? defaultNames;
}
