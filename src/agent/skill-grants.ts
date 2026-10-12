import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentResolutionOptions, AgentSnapshot } from './types.js';

type Skill = Readonly<{ name: string; path: string; instructions: string }>;

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveSkill(name: string, options: AgentResolutionOptions): Skill {
  for (const root of [path.join(options.workspaceDir, 'skills'), path.join(options.installationDir, 'skills')]) {
    const candidate = path.join(root, name, 'SKILL.md');
    if (!existsSync(candidate)) continue;
    try {
      const realRoot = realpathSync(root);
      const realFile = realpathSync(candidate);
      if (!contained(realRoot, realFile) || !statSync(realFile).isFile()) throw new Error('outside skill root');
      return Object.freeze({ name, path: realFile, instructions: readFileSync(realFile, 'utf8') });
    } catch {
      throw new Error(`Agent: invalid skill path "${name}".`);
    }
  }
  throw new Error(`Agent: unknown skill "${name}".`);
}

function readGrants(skill: Skill, knownCommands: ReadonlySet<string>): string[] {
  const sidecar = path.join(path.dirname(skill.path), 'janissary.json');
  if (!existsSync(sidecar)) return [];
  let declaration: unknown;
  try { declaration = JSON.parse(readFileSync(sidecar, 'utf8')) as unknown; } catch { throw new Error(`Agent: malformed skill grants "${skill.name}".`); }
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
  const selected = [...new Set(names)].map((name) => resolveSkill(name, options));
  const grants = [...new Set(selected.flatMap((skill) => readGrants(skill, knownCommands)))].toSorted((left, right) => left.localeCompare(right));
  return Object.freeze({ skills: Object.freeze(selected), grants: Object.freeze(grants) });
}
