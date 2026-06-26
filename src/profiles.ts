import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { AgentState, ProfileParsed } from './types.js';

// A profile is a named, reusable set of agents for a particular use case (writing code,
// surfing the web, authoring a book, …). Each profile is a directory under the profiles
// directory holding one `<agentname>.json` file per agent, in the agent-state schema.
// Profiles live in a top-level, committable `profiles/` dir (not `.janissary/`, which is
// gitignored and whose `state/` is cleared each launch).

let profileDir = '';

export function initProfileDir(projectDir: string): void {
  profileDir = path.join(projectDir, 'profiles');
}

export function ensureProfileDir(): void {
  mkdirSync(profileDir, { recursive: true });
}

export function profilePath(name: string): string {
  return path.join(profileDir, name);
}

export function profileExists(name: string): boolean {
  return profileDir !== '' && existsSync(profilePath(name));
}

export function listProfiles(): string[] {
  if (!existsSync(profileDir)) return [];
  try {
    return readdirSync(profileDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// Load every agent-state file in a profile. The filename (minus `.json`) is the authoritative
// agent name, so it always overrides any `name` field inside the file. Agents are ordered by
// their `number` field (mirroring `--relaunch` tab restoration) so a profile controls the
// order its tabs open; files without a number keep their (alphabetical) readdir order.
export function loadProfileAgents(name: string): AgentState[] {
  const directory = profilePath(name);
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const state = JSON.parse(readFileSync(path.join(directory, f), 'utf8')) as AgentState;
          return { ...state, name: f.replace(/\.json$/, '') };
        } catch {
          // skip invalid agent state files
        }
      })
      .filter((s): s is AgentState => s !== undefined)
      .toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  } catch {
    return [];
  }
}

export const PROFILE_USAGE = 'Usage: profile launch <name> | profile list';

export function parseProfileCommand(command: string): ProfileParsed {
  const rest = command.replace(/^profile\b\s*/i, '').trim();
  if (!rest) return { error: PROFILE_USAGE };
  const tokens = rest.split(/\s+/);
  const head = tokens[0].toLowerCase();
  if (head === 'list') return { action: 'list' };
  if (head === 'launch') {
    if (!tokens[1]) return { error: 'Usage: profile launch <name>' };
    return { action: 'launch', name: tokens[1] };
  }
  return { error: PROFILE_USAGE };
}
