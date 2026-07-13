import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { AgentState } from '../types.js';

let stateDirectory = '';

export function initAgentStateDirectory(projectDirectory: string): void {
  stateDirectory = path.join(projectDirectory, '.janissary', 'state');
}

export function ensureStateDirectory(): void {
  mkdirSync(stateDirectory, { recursive: true });
}

const VALID_NAME = /^[\w-]+$/;

export function agentStatePath(name: string): string {
  if (!VALID_NAME.test(name)) throw new Error(`Invalid agent name: "${name}"`);
  return path.join(stateDirectory, `${name}.json`);
}

function isAgentState(x: unknown): x is AgentState {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as AgentState).name === 'string' &&
    typeof (x as AgentState).dotColor === 'string' &&
    typeof (x as AgentState).active === 'boolean'
  );
}

export function loadAgentState(name: string): AgentState | undefined {
  const path = agentStatePath(name);
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isAgentState(parsed) ? parsed : undefined;
  } catch {
    // skip invalid agent state files
  }
}

export function saveAgentState(state: AgentState): void {
  ensureStateDirectory();
  writeFileSync(agentStatePath(state.name), JSON.stringify(state, null, 2) + '\n');
}

export function clearStateDirectory(): void {
  if (!stateDirectory) return;
  try { rmSync(stateDirectory, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function listAgentStates(): AgentState[] {
  if (!existsSync(stateDirectory)) return [];
  try {
    return readdirSync(stateDirectory)
      .filter((f) => f.endsWith('.json'))
      .map((f) => loadAgentState(f.replace(/\.json$/, '')))
      .filter((s): s is AgentState => s !== undefined);
  } catch {
    return [];
  }
}
