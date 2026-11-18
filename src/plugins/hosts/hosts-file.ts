import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readJsonConfigFile, writeJsonConfigFile } from '../files.js';
import { decodeHosts, formatDestination } from './hosts-values.js';
import type { SavedHost } from './hosts-values.js';

const FILE_NAME = 'hosts.json';

export type HostsNotify = (message: string) => void;
export type HostsProblem = { path: string; problem: string };
export type HostsRead = {
  hosts: SavedHost[];
  path: string;
  usable: boolean;
  problems: HostsProblem[];
};
export type HostsChange<T> =
  | { ok: false; error: string }
  | { ok: true; hosts: SavedHost[]; result: T };
export type HostsMutation<T> =
  | { ok: false; error: string }
  | { ok: true; hosts: SavedHost[]; path: string; result: T };

type FileState =
  | { kind: 'missing' }
  | { kind: 'usable'; hosts: SavedHost[] }
  | { kind: 'unusable'; problem: string };
type Consulted = { filePath: string; state: FileState };

const reported = new Map<string, string>();

function isMissing(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) return error.code === 'ENOENT';
  return false;
}

function withoutPeriod(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

function readFailureProblem(problem: string): string {
  return problem.includes('not valid JSON')
    ? `${FILE_NAME} is not valid JSON`
    : `${FILE_NAME} could not be read`;
}

function problemMessage(filePath: string, problem: string): string {
  return `Hosts file ${filePath} is unusable: ${problem}.`;
}

function readAt(filePath: string): FileState {
  try {
    if (statSync(filePath).isDirectory()) {
      return { kind: 'unusable', problem: `${FILE_NAME} is a directory` };
    }
  } catch (error) {
    if (isMissing(error)) return { kind: 'missing' };
    return { kind: 'unusable', problem: `${FILE_NAME} could not be read` };
  }
  const read = readJsonConfigFile(filePath, FILE_NAME, decodeHosts, 'is not a valid hosts catalog');
  if (read.problem !== undefined) return { kind: 'unusable', problem: readFailureProblem(read.problem) };
  if (!read.value.ok) return { kind: 'unusable', problem: withoutPeriod(read.value.error) };
  return { kind: 'usable', hosts: read.value.hosts };
}

function collectProblems(consulted: Consulted[]): HostsProblem[] {
  const problems: HostsProblem[] = [];
  for (const { filePath, state } of consulted) {
    if (state.kind === 'unusable') problems.push({ path: filePath, problem: state.problem });
  }
  return problems;
}

function reportProblems(consulted: Consulted[], notify: HostsNotify): void {
  for (const { filePath, state } of consulted) {
    if (state.kind === 'unusable') {
      if (reported.get(filePath) !== state.problem) {
        reported.set(filePath, state.problem);
        notify(problemMessage(filePath, state.problem));
      }
    } else {
      reported.delete(filePath);
    }
  }
}

export function readHostsFile(root: string, home: string, notify?: HostsNotify): HostsRead {
  const homePath = path.join(home, '.janissary', FILE_NAME);
  const consulted: Consulted[] = [];
  let effective: { filePath: string; hosts: SavedHost[] } | undefined;
  if (root !== '') {
    const projectPath = path.join(root, '.janissary', FILE_NAME);
    const state = readAt(projectPath);
    consulted.push({ filePath: projectPath, state });
    if (state.kind === 'usable') effective = { filePath: projectPath, hosts: state.hosts };
  }
  if (effective === undefined) {
    const state = readAt(homePath);
    consulted.push({ filePath: homePath, state });
    if (state.kind === 'usable') effective = { filePath: homePath, hosts: state.hosts };
  }
  const problems = collectProblems(consulted);
  if (notify !== undefined) reportProblems(consulted, notify);
  if (effective !== undefined) {
    return { hosts: effective.hosts, path: effective.filePath, usable: true, problems };
  }
  const homeState = consulted.at(-1)?.state;
  return {
    hosts: [],
    path: homePath,
    usable: homeState?.kind !== 'unusable',
    problems,
  };
}

export function serializeHosts(hosts: readonly SavedHost[]): string {
  const ordered = sortHosts(hosts);
  if (ordered.length === 0) return '{}';
  const members = ordered.map((host) => `  ${JSON.stringify(host.name)}: ${serializeEntry(host)}`);
  return `{\n${members.join(',\n')}\n}`;
}

function sortHosts(hosts: readonly SavedHost[]): SavedHost[] {
  return hosts.toSorted((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function serializeEntry(host: SavedHost): string {
  const fields: string[] = [];
  if (host.user !== undefined) fields.push(`  "user": ${JSON.stringify(host.user)}`);
  fields.push(`  "destination": ${JSON.stringify(formatDestination(host))}`);
  if (host.path !== undefined) fields.push(`  "path": ${JSON.stringify(host.path)}`);
  return `{\n${fields.join(',\n')}\n}`.replaceAll('\n', '\n  ');
}

export function writeHostsFile(filePath: string, hosts: readonly SavedHost[]): boolean {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonConfigFile(filePath, `${serializeHosts(hosts)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function mutateHostsFile<T>(
  root: string,
  home: string,
  notify: HostsNotify | undefined,
  change: (hosts: SavedHost[]) => HostsChange<T>,
): HostsMutation<T> {
  const read = readHostsFile(root, home, notify);
  if (!read.usable) {
    return { ok: false, error: `Cannot save hosts: ${read.path} is unusable — fix it by hand.` };
  }
  const applied = change(read.hosts);
  if (!applied.ok) return { ok: false, error: applied.error };
  const hosts = sortHosts(applied.hosts);
  if (!writeHostsFile(read.path, hosts)) {
    return { ok: false, error: `Could not write ${FILE_NAME} at ${read.path}.` };
  }
  return { ok: true, hosts, path: read.path, result: applied.result };
}
