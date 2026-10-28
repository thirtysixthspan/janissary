import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ProfileRow } from './profile/types.js';

// A profile is a named, reusable set of AI harnesses and the tabs that support them for a particular
// use case (writing code, surfing the web, authoring a book, …). Each profile is a single JSON file
// `profiles/<name>.json` holding one `tabs` array plus the profile-level `monitors` and `layout` keys,
// or a runscript `profiles/<name>.rs` whose lines run in the system shell instead. Profiles live
// in a top-level, committable `profiles/` dir (not `.janissary/`, which is gitignored and whose
// `state/` is cleared each launch).

let projectProfileDir = '';
let janissaryProfileDir = '';

export type ProfileSource = { kind: 'runscript' | 'config'; file: string };

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

// Presence is checked without following links, so a symlinked `.rs` still claims the name and is
// refused by the runscript reader instead of quietly handing the launch to the `.json` beside it.
function entryPresent(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function sourceIn(dir: string, name: string): ProfileSource | undefined {
  const runscript = path.join(dir, `${name}.rs`);
  if (entryPresent(runscript)) return { kind: 'runscript', file: runscript };
  const config = path.join(dir, `${name}.json`);
  if (existsSync(config)) return { kind: 'config', file: config };
  return undefined;
}

export function resolveProfile(name: string): ProfileSource | undefined {
  if (projectProfileDir === '') return undefined;
  return sourceIn(projectProfileDir, name) ?? sourceIn(janissaryProfileDir, name);
}

function listProfileDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && /\.(?:json|rs)$/.test(d.name))
      .map((d) => d.name.replace(/\.(?:json|rs)$/, ''));
    return [...new Set(names)].toSorted((a, b) => a.localeCompare(b));
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
