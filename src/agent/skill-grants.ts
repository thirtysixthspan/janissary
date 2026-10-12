import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentResolutionOptions, AgentSnapshot } from './types.js';

type Skill = Readonly<{ source: 'project' | 'janissary'; name: string; path: string; instructions: string }>;
type ResolvedSkill = Readonly<{ skill: Skill; directory: string }>;

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function resolveSkill(name: string, options: AgentResolutionOptions): ResolvedSkill {
  const roots = [
    { source: 'project', path: options.workspaceDir },
    { source: 'janissary', path: options.installationDir },
  ] as const;
  for (const { source, path: sourceRoot } of roots) {
    const root = path.join(sourceRoot, 'skills');
    let realRoot: string;
    try {
      const realSourceRoot = realpathSync(sourceRoot);
      realRoot = realpathSync(root);
      if (!contained(realSourceRoot, realRoot) || !statSync(realRoot).isDirectory()) {
        throw new Error('invalid skill root');
      }
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw new Error(`Agent: invalid skill path "${name}".`, { cause: error });
    }
    const candidate = path.join(root, name, 'SKILL.md');
    try {
      lstatSync(candidate);
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw new Error(`Agent: invalid skill path "${name}".`, { cause: error });
    }
    const directory = path.dirname(candidate);
    try {
      const realDirectory = realpathSync(directory);
      if (realDirectory !== path.resolve(realRoot, name) || !contained(realRoot, realDirectory) || !statSync(realDirectory).isDirectory()) {
        throw new Error('invalid skill directory');
      }
      const realFile = realpathSync(candidate);
      if (!contained(realDirectory, realFile) || !statSync(realFile).isFile()) throw new Error('outside skill directory');
      return Object.freeze({
        skill: Object.freeze({ source, name, path: realFile, instructions: readFileSync(realFile, 'utf8') }),
        directory: realDirectory,
      });
    } catch {
      throw new Error(`Agent: invalid skill path "${name}".`);
    }
  }
  throw new Error(`Agent: unknown skill "${name}".`);
}

function readGrants(resolved: ResolvedSkill, knownCommands: ReadonlySet<string>): string[] {
  const { skill, directory } = resolved;
  const sidecar = path.join(path.dirname(skill.path), 'janissary.json');
  try {
    lstatSync(sidecar);
  } catch (error) {
    if (isMissingPath(error)) return [];
    throw new Error(`Agent: invalid skill path "${skill.name}".`, { cause: error });
  }
  let realSidecar: string;
  try {
    realSidecar = realpathSync(sidecar);
    if (!contained(directory, realSidecar) || !statSync(realSidecar).isFile()) throw new Error('outside skill directory');
  } catch {
    throw new Error(`Agent: invalid skill path "${skill.name}".`);
  }
  let declaration: unknown;
  try { declaration = JSON.parse(readFileSync(realSidecar, 'utf8')) as unknown; } catch { throw new Error(`Agent: malformed skill grants "${skill.name}".`); }
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) throw new Error(`Agent: malformed skill grants "${skill.name}".`);
  const record = declaration as { version?: unknown; commands?: unknown };
  if (record.version !== 1 || !Array.isArray(record.commands) || record.commands.some((item) => typeof item !== 'string')) {
    throw new Error(`Agent: malformed skill grants "${skill.name}".`);
  }
  const declaredCommands = record.commands as unknown[];
  const grants: string[] = [];
  for (const item of declaredCommands) {
    if (typeof item !== 'string') throw new Error(`Agent: malformed skill grants "${skill.name}".`);
    const normalized = item.trim().toLowerCase();
    if (!normalized || !knownCommands.has(normalized)) {
      throw new Error(`Agent: unknown command grant "${item}" in skill "${skill.name}".`);
    }
    grants.push(normalized);
  }
  return grants;
}

export function resolveAgentSkills(
  names: readonly string[],
  options: AgentResolutionOptions,
  canonicalCommands: readonly string[],
): Pick<AgentSnapshot, 'skills' | 'grants'> {
  const knownCommands = new Set(canonicalCommands.map((name) => name.toLowerCase()));
  const resolved = [...new Set(names)].map((name) => resolveSkill(name, options));
  const grants = [...new Set(resolved.flatMap((skill) => readGrants(skill, knownCommands)))].toSorted((left, right) => left.localeCompare(right));
  return Object.freeze({ skills: Object.freeze(resolved.map(({ skill }) => skill)), grants: Object.freeze(grants) });
}
