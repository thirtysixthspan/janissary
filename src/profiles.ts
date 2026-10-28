import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ProfileRow } from './profile/types.js';

// A profile is a named, reusable set of AI harnesses and the tabs that support them for a particular
// use case (writing code, surfing the web, authoring a book, …). Each profile is a runscript
// `profiles/<name>.rs` whose lines run in the system shell. Profiles live in a top-level,
// committable `profiles/` dir (not `.janissary/`, which is gitignored and whose `state/` is cleared
// each launch).

let projectProfileDir = '';
let janissaryProfileDir = '';

export function initProfileDir(projectDir: string, janissaryDir: string = projectDir): void {
  projectProfileDir = path.join(projectDir, 'profiles');
  janissaryProfileDir = path.join(janissaryDir, 'profiles');
}

// Presence is checked without following links, so a symlinked `.rs` still claims the name and is
// refused by the runscript reader instead of quietly handing the launch to the installation's copy.
function entryPresent(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function runscriptIn(dir: string, name: string): string | undefined {
  const runscript = path.join(dir, `${name}.rs`);
  return entryPresent(runscript) ? runscript : undefined;
}

export function resolveProfile(name: string): string | undefined {
  if (projectProfileDir === '') return undefined;
  return runscriptIn(projectProfileDir, name) ?? runscriptIn(janissaryProfileDir, name);
}

function listProfileDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.rs'))
      .map((d) => d.name.slice(0, -'.rs'.length));
    return names.toSorted((a, b) => a.localeCompare(b));
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
