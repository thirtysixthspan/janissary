import { lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nextFreeName } from '../../editor/next-free-name.js';
import { ensureSystemScheduleExcluded } from './local-exclude.js';
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

function runscriptsDirectoryPath(projectRoot: string): string {
  return path.join(projectRoot, '.janissary', 'scripts');
}

function excludeScriptsFromGit(projectRoot: string): void {
  try {
    ensureSystemScheduleExcluded(projectRoot);
  } catch (error) {
    process.stderr.write(`System schedule paths could not be excluded from Git: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function inspectScriptsDirectory(projectRoot: string): { directory: string; exists: boolean } {
  const stateDir = path.join(projectRoot, '.janissary');
  const scriptsDir = runscriptsDirectoryPath(projectRoot);
  if (!assertDirectory(stateDir)) return { directory: scriptsDir, exists: false };
  if (!assertDirectory(scriptsDir)) return { directory: scriptsDir, exists: false };
  return { directory: scriptsDir, exists: true };
}

function scriptsDirectory(projectRoot: string): { directory: string; exists: boolean } {
  excludeScriptsFromGit(projectRoot);
  return inspectScriptsDirectory(projectRoot);
}

export function readRunscript(projectRoot: string, name: string): { file: string; exists: boolean; lines: string[]; text: string } {
  if (!isRunscriptName(name)) throw new Error(`Invalid runscript name: ${name}`);
  const file = path.join(runscriptsDirectoryPath(projectRoot), `${name}.rs`);
  const scripts = scriptsDirectory(projectRoot);
  if (!scripts.exists) return { file, exists: false, lines: [], text: '' };
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file, exists: false, lines: [], text: '' };
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Runscript path is not a regular file: ${file}`);
  const text = readFileSync(file, 'utf8');
  return { file, exists: true, lines: parseRunscriptText(text), text };
}

function makeScriptsDirectory(projectRoot: string): void {
  const stateDir = path.join(projectRoot, '.janissary');
  const scriptsDir = runscriptsDirectoryPath(projectRoot);
  if (!assertDirectory(stateDir)) mkdirSync(stateDir);
  if (!assertDirectory(scriptsDir)) mkdirSync(scriptsDir);
}

export function ensureScriptsDirectory(projectRoot: string): void {
  excludeScriptsFromGit(projectRoot);
  makeScriptsDirectory(projectRoot);
}

function createExclusive(file: string, text: string): boolean {
  try {
    writeFileSync(file, text, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

// Creates an empty runscript without ever overwriting one. An existing entry is accepted only when
// the reader would accept it as a regular file, so a symlink planted at the target is refused.
export function createRunscript(projectRoot: string, name: string): { file: string; created: boolean } {
  if (!isRunscriptName(name)) throw new Error(`Invalid runscript name: ${name}`);
  const file = path.join(runscriptsDirectoryPath(projectRoot), `${name}.rs`);
  if (!scriptsDirectory(projectRoot).exists) makeScriptsDirectory(projectRoot);
  if (createExclusive(file, '')) return { file, created: true };
  readRunscript(projectRoot, name);
  return { file, created: false };
}

export function listRunscriptNames(projectRoot: string): string[] {
  const scripts = inspectScriptsDirectory(projectRoot);
  if (!scripts.exists) return [];
  return readdirSync(scripts.directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rs'))
    .map((entry) => entry.name.slice(0, -3))
    .filter(isRunscriptName)
    .toSorted((left, right) => left.localeCompare(right));
}

export function catalogRunscripts(projectRoot: string): string[] {
  excludeScriptsFromGit(projectRoot);
  return listRunscriptNames(projectRoot);
}

export function deleteRunscript(projectRoot: string, name: string): boolean {
  const { file, exists } = readRunscript(projectRoot, name);
  if (!exists) return false;
  try {
    unlinkSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function cloneRunscript(projectRoot: string, name: string): string | undefined {
  const source = readRunscript(projectRoot, name);
  if (!source.exists) return undefined;
  const directory = runscriptsDirectoryPath(projectRoot);
  const target = nextFreeName(directory, `${name}.rs`);
  const file = path.join(directory, target);
  if (!createExclusive(file, source.text)) throw new Error(`Runscript already exists: ${file}`);
  return target.slice(0, -3);
}

export function newUntitledRunscript(projectRoot: string): string {
  ensureScriptsDirectory(projectRoot);
  const name = nextFreeName(runscriptsDirectoryPath(projectRoot), 'untitled.rs').slice(0, -3);
  try {
    createRunscript(projectRoot, name);
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { runscriptName: name });
    throw error;
  }
  return name;
}
