import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isRunscriptName, parseRunscriptText } from './runscript.js';

function assertDirectory(directory: string): boolean {
  let stat;
  try {
    stat = lstatSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Runscript path is not a real directory: ${directory}`);
  return true;
}

function scriptsDirectory(projectRoot: string): { directory: string; exists: boolean } {
  const stateDir = path.join(projectRoot, '.janissary');
  const scriptsDir = path.join(stateDir, 'scripts');
  if (!assertDirectory(stateDir)) return { directory: scriptsDir, exists: false };
  if (!assertDirectory(scriptsDir)) return { directory: scriptsDir, exists: false };
  return { directory: scriptsDir, exists: true };
}

export function readRunscript(projectRoot: string, name: string): { file: string; exists: boolean; lines: string[] } {
  if (!isRunscriptName(name)) throw new Error(`Invalid runscript name: ${name}`);
  const file = path.join(projectRoot, '.janissary', 'scripts', `${name}.rs`);
  const scripts = scriptsDirectory(projectRoot);
  if (!scripts.exists) return { file, exists: false, lines: [] };
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file, exists: false, lines: [] };
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Runscript path is not a regular file: ${file}`);
  return { file, exists: true, lines: parseRunscriptText(readFileSync(file, 'utf8')) };
}

export function catalogRunscripts(projectRoot: string): string[] {
  const scripts = scriptsDirectory(projectRoot);
  if (!scripts.exists) return [];
  return readdirSync(scripts.directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rs'))
    .map((entry) => entry.name.slice(0, -3))
    .filter(isRunscriptName)
    .toSorted((left, right) => left.localeCompare(right));
}
