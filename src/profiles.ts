import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ProfileRow } from './profile/types.js';
export { PROFILE_USAGE, parseProfileCommand } from './profile/command.js';
export { loadProfile } from './profile/file.js';

// A profile is a named, reusable set of agents and harnesses for a particular use case (writing
// code, surfing the web, authoring a book, …). Each profile is a single JSON file `profiles/<name>.json`
// holding an `agents` array, a `harnesses` array, and plain profile-level config keys. Profiles live
// in a top-level, committable `profiles/` dir (not `.janissary/`, which is gitignored and whose
// `state/` is cleared each launch).

let projectProfileDir = '';
let janissaryProfileDir = '';

export function initProfileDir(projectDir: string, janissaryDir: string = projectDir): void {
  projectProfileDir = path.join(projectDir, 'profiles');
  janissaryProfileDir = path.join(janissaryDir, 'profiles');
}

export function profilePath(name: string): string {
  return path.join(projectProfileDir, `${name}.json`);
}

export function profileReadPath(name: string): string {
  const projectPath = profilePath(name);
  if (existsSync(projectPath)) return projectPath;
  return path.join(janissaryProfileDir, `${name}.json`);
}

export function profileExists(name: string): boolean {
  return projectProfileDir !== '' && existsSync(profileReadPath(name));
}

function listProfileDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name.replace(/\.json$/, ''))
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function listProfiles(): string[] {
  return listProfileRows().map((row) => row.name);
}

export function listProfileRows(): ProfileRow[] {
  const project = listProfileDir(projectProfileDir);
  const projectNames = new Set(project);
  const janissary = listProfileDir(janissaryProfileDir).filter((name) => !projectNames.has(name));
  return [
    ...project.map((name) => ({ name, source: 'project' as const })),
    ...janissary.map((name) => ({ name, source: 'janissary' as const })),
  ];
}
