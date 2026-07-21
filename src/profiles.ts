import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
export { PROFILE_USAGE, parseProfileCommand } from './profile-command.js';
export { loadProfile } from './profile-file.js';

// A profile is a named, reusable set of agents and harnesses for a particular use case (writing
// code, surfing the web, authoring a book, …). Each profile is a single JSON file `profiles/<name>.json`
// holding an `agents` array, a `harnesses` array, and plain profile-level config keys. Profiles live
// in a top-level, committable `profiles/` dir (not `.janissary/`, which is gitignored and whose
// `state/` is cleared each launch).

let profileDir = '';

export function initProfileDir(projectDir: string): void {
  profileDir = path.join(projectDir, 'profiles');
}

export function profilePath(name: string): string {
  return path.join(profileDir, `${name}.json`);
}

export function profileExists(name: string): boolean {
  return profileDir !== '' && existsSync(profilePath(name));
}

export function listProfiles(): string[] {
  if (!existsSync(profileDir)) return [];
  try {
    return readdirSync(profileDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name.replace(/\.json$/, ''))
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
