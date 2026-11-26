import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = '$root';
const ROOT_PREFIX = `${ROOT}/`;
const HOME_PREFIX = '$HOME/';
const WORKSPACE = '$workspace';
const WORKSPACE_PREFIX = `${WORKSPACE}/`;
const TILDE = '~';

export type SshConfigTarget = {
  path: string;
  display: string;
};

function expandOperand(input: string, root: string, home: string, workspace: string): string | undefined {
  if (path.isAbsolute(input)) return input;
  if (input === ROOT || input === ROOT_PREFIX) return root;
  if (input.startsWith(ROOT_PREFIX)) return path.join(root, input.slice(ROOT_PREFIX.length));
  if (input === WORKSPACE) return workspace;
  if (input.startsWith(WORKSPACE_PREFIX)) return path.join(workspace, input.slice(WORKSPACE_PREFIX.length));
  if (input === TILDE) return home;
  if (input.startsWith(`${TILDE}/`)) return path.join(home, input.slice(2));
  if (input.startsWith(HOME_PREFIX)) return path.join(home, input.slice(HOME_PREFIX.length));
  return undefined;
}

function resolveRelative(input: string, cwd: string, root: string): string {
  const fromCwd = path.resolve(cwd, input);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRoot = path.resolve(root, input);
  return existsSync(fromRoot) ? fromRoot : fromCwd;
}

function abbreviate(p: string, root: string, home: string): string {
  const state = path.join(root, '.janissary');
  if (p === state) return ROOT_PREFIX;
  if (p.startsWith(state + path.sep)) return ROOT + p.slice(state.length);
  if (p === root) return ROOT_PREFIX;
  if (p.startsWith(root + path.sep)) return ROOT + p.slice(root.length);
  if (p === home) return TILDE;
  if (p.startsWith(home + path.sep)) return TILDE + p.slice(home.length);
  return p;
}

export function resolveSshConfigTarget(
  root: string, home: string, workspace: string, cwd: string, operand: string,
): SshConfigTarget {
  const expanded = expandOperand(operand, root, home, workspace);
  const absolute = expanded ?? resolveRelative(operand, cwd, root);
  return { path: absolute, display: abbreviate(absolute, root, home) };
}
