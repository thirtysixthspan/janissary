import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { listTasksFromRoot } from '../tasks.js';
import { containedAbsolute } from '../path-containment.js';
import { resolveAgentSkills } from './skill-grants.js';
import type { AgentResolutionOptions, AgentSnapshot } from './types.js';

function taskError(message: string): Error {
  return new Error(`Agent: ${message}.`);
}

function installedTaskRoot(installation: string): string | undefined {
  try {
    const realInstallation = realpathSync(installation);
    const realTaskRoot = realpathSync(path.join(installation, 'ai', 'tasks'));
    return containedAbsolute(realInstallation, realTaskRoot) ? realTaskRoot : undefined;
  } catch {
    return undefined;
  }
}

function canonicalPath(input: string, options: AgentResolutionOptions): { target: string; allowedRoots: string[] } {
  const installation = path.resolve(options.installationDir);
  const workspace = path.resolve(options.workspaceDir);
  const expanded = input.startsWith('$janissary/') ? path.join(installation, input.slice('$janissary/'.length)) : input;
  const target = path.resolve(workspace, expanded);
  const installedRoot = installedTaskRoot(installation);
  return { target, allowedRoots: [workspace, ...(installedRoot ? [installedRoot] : [])] };
}

function resolveTaskPath(request: string, options: AgentResolutionOptions): string {
  const { target, allowedRoots } = canonicalPath(request, options);
  let realTarget: string;
  try {
    realTarget = realpathSync(target);
    if (!statSync(realTarget).isFile()) throw new Error('not a file');
  } catch {
    throw taskError(`unknown task "${request}"`);
  }
  const permitted = allowedRoots.some((root) => {
    try { return containedAbsolute(realpathSync(root), realTarget); } catch { return false; }
  });
  if (!permitted) throw taskError(`task path outside allowed roots "${request}"`);
  return realTarget;
}

function validateTaskRoot(root: string, source: 'project' | 'janissary'): void {
  const taskRoot = path.join(root, 'ai', 'tasks');
  try {
    statSync(taskRoot);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }

  const realTaskRoot = realpathSync(taskRoot);
  const realSourceRoot = realpathSync(root);
  const realAllowedRoot = source === 'project'
    ? realSourceRoot
    : path.join(realSourceRoot, 'ai', 'tasks');
  if (!containedAbsolute(realAllowedRoot, realTaskRoot)) {
    throw taskError(`task root outside allowed roots "${source}"`);
  }
}

function findBareTask(filename: string, options: AgentResolutionOptions): string {
  for (const source of ['project', 'janissary'] as const) {
    const root = source === 'project' ? options.workspaceDir : options.installationDir;
    validateTaskRoot(root, source);
    const rows = listTasksFromRoot(root, source, true);
    const matches = rows.filter((row) => !row.dir && row.source === source && row.name === filename);
    if (matches.length === 0) continue;
    const paths = matches.map((row) => row.path).toSorted((left, right) => left.localeCompare(right));
    if (paths.length > 1) throw taskError(`ambiguous task "${filename}": ${paths.join(', ')}`);
    const taskPath = source === 'project'
      ? path.join(root, 'ai', 'tasks', paths[0] ?? '')
      : `$janissary/ai/tasks/${paths[0] ?? ''}`;
    return resolveTaskPath(taskPath, options);
  }
  throw taskError(`unknown task "${filename}"`);
}

export function resolveAgentTask(request: string, options: AgentResolutionOptions): { path: string; text: string } {
  const explicit = request.includes('/') || request.startsWith('.') || request.startsWith('$janissary/');
  const resolved = explicit ? resolveTaskPath(request, options) : findBareTask(request, options);
  try {
    return { path: resolved, text: readFileSync(resolved, 'utf8') };
  } catch {
    throw taskError(`could not read task "${request}"`);
  }
}

export function resolveAgentSnapshot(
  request: string,
  skillNames: readonly string[],
  options: AgentResolutionOptions,
  canonicalCommands: readonly string[],
): AgentSnapshot {
  const task = resolveAgentTask(request, options);
  const skills = resolveAgentSkills(skillNames, options, canonicalCommands);
  return Object.freeze({ taskPath: task.path, taskText: task.text, skills: skills.skills, grants: skills.grants });
}
