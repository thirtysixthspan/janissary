import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import defaultNames from '../../agent-names.json' with { type: 'json' };

export let agentNames: string[] = defaultNames;

// Reads `.janissary/agent-names.json` from the project directory and, when present and valid,
// uses it in place of the bundled name list for the rest of this run — the same load-with-fallback
// contract as `config.ts`'s `.janissary/config.json`.
export function loadAgentNames(projectDirectory: string): void {
  const overridePath = path.join(projectDirectory, '.janissary', 'agent-names.json');
  if (!existsSync(overridePath)) { agentNames = defaultNames; return; }
  try {
    agentNames = JSON.parse(readFileSync(overridePath, 'utf8')) as string[];
  } catch {
    process.stderr.write('warning: .janissary/agent-names.json is invalid JSON — using the bundled name list\n');
    agentNames = defaultNames;
  }
}
