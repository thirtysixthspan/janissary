import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ProfileEntry, ProfileFilesEntry, ProfileMonitor, ProfileParsed } from './types.js';

// A profile is a named, reusable set of agents for a particular use case (writing code,
// surfing the web, authoring a book, …). Each profile is a directory under the profiles
// directory holding one `<agentname>.json` file per agent, in the agent-state schema.
// Profiles live in a top-level, committable `profiles/` dir (not `.janissary/`, which is
// gitignored and whose `state/` is cleared each launch).

let profileDir = '';

export function initProfileDir(projectDir: string): void {
  profileDir = path.join(projectDir, 'profiles');
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

// Load every entry file in a profile — agent-state files, or harness entry files (discriminated
// by a `harness` key). The filename (minus `.json`) is the authoritative name, so it always
// overrides any `name` field inside the file. Entries are ordered by their `number` field
// (mirroring `--relaunch` tab restoration) so a profile controls the order its tabs open; files
// without a number keep their (alphabetical) readdir order.
export function loadProfileEntries(name: string): ProfileEntry[] {
  const directory = profilePath(name);
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory)
      // `_`-prefixed files are reserved profile-level config (e.g. `_monitors.json`), never entries.
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => {
        try {
          const parsed = JSON.parse(readFileSync(path.join(directory, f), 'utf8')) as ProfileEntry;
          const label = f.replace(/\.json$/, '');
          return 'harness' in parsed ? { ...parsed, label } : { ...parsed, name: label };
        } catch {
          // skip invalid entry files
        }
      })
      .filter((s): s is ProfileEntry => s !== undefined)
      .toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  } catch {
    return [];
  }
}

function isProfileMonitor(value: unknown): value is ProfileMonitor {
  if (typeof value !== 'object' || value === null) return false;
  const monitor = value as Record<string, unknown>;
  return typeof monitor.persona === 'string'
    && Array.isArray(monitor.targets)
    && monitor.targets.every((target) => typeof target === 'string');
}

// Profile-level monitors live in a reserved `_monitors.json` file — a JSON array of
// `{ persona, targets }` — kept out of the entry set by the leading underscore (it is not an
// agent or harness tab). Returns [] when the file is absent, unparseable, or not an array;
// malformed elements are dropped.
export function loadProfileMonitors(name: string): ProfileMonitor[] {
  const file = path.join(profilePath(name), '_monitors.json');
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isProfileMonitor) : [];
  } catch {
    return [];
  }
}

function isProfileFilesEntry(value: unknown): value is ProfileFilesEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (entry.dock === undefined || (typeof entry.dock === 'string' && ['left', 'right'].includes(entry.dock)))
    && (entry.in === undefined || typeof entry.in === 'string');
}

// Profile-level file-tree tabs live in a reserved `_files.json` file — a JSON array of
// `{ dock?, in? }` — kept out of the entry set by the leading underscore. Returns [] when the file
// is absent, unparseable, or not an array; malformed elements are dropped.
export function loadProfileFiles(name: string): ProfileFilesEntry[] {
  const file = path.join(profilePath(name), '_files.json');
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isProfileFilesEntry) : [];
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
