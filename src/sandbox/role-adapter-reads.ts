import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { containedStrictly } from '../path-containment.js';
import { dualPath, resolvePath } from './resolve.js';

const ROLE_ADAPTER_PACKAGES = [
  '@agentclientprotocol/claude-agent-acp',
  '@agentclientprotocol/codex-acp',
];

export type AdapterReadDir = { literal: string; real: string };

type Dependency = { name: string; optional: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function namedDependencies(value: unknown, optional = false): Dependency[] {
  if (!isRecord(value)) return [];
  return Object.keys(value).map((name) => ({ name, optional }));
}

function dependencies(packageDir: string): Dependency[] {
  const manifestPath = path.join(packageDir, 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`Invalid package manifest: ${manifestPath}`);

  const peerDependencies = namedDependencies(parsed.peerDependencies, true);
  const all = [
    ...namedDependencies(parsed.dependencies),
    ...namedDependencies(parsed.optionalDependencies, true),
    ...peerDependencies,
  ];
  const unique = new Map<string, Dependency>();
  for (const dependency of all) {
    const prior = unique.get(dependency.name);
    unique.set(dependency.name, { name: dependency.name, optional: prior ? prior.optional && dependency.optional : dependency.optional });
  }
  return [...unique.values()];
}

function findDependency(name: string, fromDir: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const modulesDir = path.join(dir, 'node_modules');
    const candidate = path.resolve(modulesDir, name);
    if (containedStrictly(modulesDir, candidate) && existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function addPackageTree(
  packageDir: string,
  readDirs: Map<string, AdapterReadDir>,
  scanned: Set<string>,
): void {
  const paths = dualPath(packageDir);
  readDirs.set(`${paths.literal}\0${paths.real}`, paths);
  if (scanned.has(paths.real)) return;
  scanned.add(paths.real);

  for (const dependency of dependencies(paths.real)) {
    const resolved = findDependency(dependency.name, paths.real);
    if (!resolved) {
      if (dependency.optional) continue;
      throw new Error(`Missing runtime dependency ${dependency.name} for ${paths.real}`);
    }
    addPackageTree(resolved, readDirs, scanned);
  }
}

export function roleAdapterReadDirs(executable: string, installRoot: string): AdapterReadDir[] | undefined {
  const resolvedExecutable = resolvePath(executable);
  for (const packageName of ROLE_ADAPTER_PACKAGES) {
    const packageDir = path.join(installRoot, 'node_modules', packageName);
    const resolvedPackageDir = resolvePath(packageDir);
    if (!existsSync(path.join(resolvedPackageDir, 'package.json'))
      || !containedStrictly(resolvedPackageDir, resolvedExecutable)) continue;

    const readDirs = new Map<string, AdapterReadDir>();
    addPackageTree(packageDir, readDirs, new Set());
    return [...readDirs.values()];
  }
  return;
}
