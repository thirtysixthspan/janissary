import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentState } from './types.js';

let stateDir = '';

export function initAgentStateDir(projectDir: string): void {
  stateDir = join(projectDir, '.janussary', 'state');
}

export function ensureStateDir(): void {
  mkdirSync(stateDir, { recursive: true });
}

export function agentStatePath(name: string): string {
  return join(stateDir, `${name}.json`);
}

export function loadAgentState(name: string): AgentState | null {
  const path = agentStatePath(name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveAgentState(state: AgentState): void {
  ensureStateDir();
  writeFileSync(agentStatePath(state.name), JSON.stringify(state, null, 2) + '\n');
}

export function clearStateDir(): void {
  if (!stateDir) return;
  try { rmSync(stateDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function listAgentStates(): AgentState[] {
  if (!existsSync(stateDir)) return [];
  try {
    return readdirSync(stateDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => loadAgentState(f.replace(/\.json$/, '')))
      .filter((s): s is AgentState => s !== null);
  } catch {
    return [];
  }
}
