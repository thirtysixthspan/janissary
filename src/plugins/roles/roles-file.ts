import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../api.js';
import type { Role, RoleEntry, RolesSource } from './shared.js';

// The roles files: the user's own at `~/.janissary/roles.json` and a project's at
// `.janissary/roles.json`, which replaces the home file wholesale when it exists — including when it
// holds an empty object, which is an explicit choice of zero roles rather than a fallback. The shape
// follows `launcher/commands-file.ts`: the same home-over-project precedence, the same partial-loss
// decode, and the same one-line problem the caller reports.
const FILE_NAME = 'roles.json';

export type RolesRead = {
  roles: Role[];
  source: RolesSource;
  path: string;
  problem?: string;
};

export const DEFAULT_ROLES: readonly Role[] = [
  {
    name: 'planning',
    description: 'Research and development of plans for new product features.',
    entries: [
      { harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' },
      { harness: 'claude', model: 'claude-opus-5-5', effort: 'xhigh' },
    ],
  },
  {
    name: 'research',
    description: 'Research, comparison, and information gathering for a task or question.',
    entries: [],
  },
  {
    name: 'code review',
    description: 'Review of code changes for correctness, style, and risk.',
    entries: [],
  },
  {
    name: 'implementation',
    description: 'Implementation of an approved plan or a described change.',
    entries: [],
  },
  {
    name: 'documentation',
    description: 'Writing and updating specs, plans, and user or developer documentation.',
    entries: [],
  },
];

type ReadAttempt = { ok: true; read: RolesRead } | { ok: false; problem: string };

function decodeEntry(value: unknown): RoleEntry | undefined {
  if (!isRecord(value)) return undefined;
  const { harness, model, effort } = value;
  if (typeof harness !== 'string' || harness.length === 0) return undefined;
  if (typeof model !== 'string' || model.length === 0) return undefined;
  if (effort !== undefined && typeof effort !== 'string') return undefined;
  return effort === undefined ? { harness, model } : { harness, model, effort };
}

// One role as the file holds it: a `description` string and an `entries` list. A key whose trimmed
// name is empty, whose value is not that shape, or whose name another key already trimmed to is
// damage — dropped and counted rather than served. Inside a surviving role, entries that do not
// decode are dropped and counted too.
function decodeRole(name: string, value: unknown, taken: Set<string>): { role?: Role; dropped: number } {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  if (trimmed.length === 0 || taken.has(key)) return { dropped: 1 };
  if (!isRecord(value)) return { dropped: 1 };
  const { description, entries } = value;
  if (typeof description !== 'string' || !Array.isArray(entries)) return { dropped: 1 };
  taken.add(key);
  const decoded: RoleEntry[] = [];
  let dropped = 0;
  for (const entry of entries) {
    const good = decodeEntry(entry);
    if (good) decoded.push(good);
    else dropped += 1;
  }
  return { role: { name: trimmed, description, entries: decoded }, dropped };
}

// The whole file object. Answers undefined only when the top level is not an object or every key was
// damage — an empty object is a valid file holding zero roles.
function decodeRoles(parsed: unknown): { roles: Role[]; dropped: number } | undefined {
  if (!isRecord(parsed)) return undefined;
  const roles: Role[] = [];
  let dropped = 0;
  const taken = new Set<string>();
  for (const [name, value] of Object.entries(parsed)) {
    const decoded = decodeRole(name, value, taken);
    dropped += decoded.dropped;
    if (decoded.role) roles.push(decoded.role);
  }
  if (roles.length === 0 && dropped > 0) return undefined;
  return { roles, dropped };
}

function readAt(filePath: string, source: 'home' | 'project'): ReadAttempt {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, problem: `roles.json could not be read at ${filePath}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: `roles.json is not valid JSON at ${filePath}` };
  }
  const decoded = decodeRoles(parsed);
  if (!decoded) {
    return { ok: false, problem: `roles.json is not a set of roles at ${filePath}` };
  }
  const { roles, dropped } = decoded;
  if (dropped > 0) {
    return {
      ok: true,
      read: {
        roles, source, path: filePath,
        problem: `roles.json dropped ${dropped} malformed ${dropped === 1 ? 'role or entry' : 'roles or entries'} at ${filePath} — showing the rest of this file.`,
      },
    };
  }
  return { ok: true, read: { roles, source, path: filePath } };
}

function createDefaultFile(homePath: string): boolean {
  return writeRolesFile(homePath, DEFAULT_ROLES);
}

// The roles in effect, read fresh. The project file wins when it exists, then the home file; a file
// that exists but does not decode falls back along that chain, and the file that broke is named in
// the problem the caller reports. When neither file exists the home file is created with the default
// roles — the feature's "created by the tab when it is not otherwise present" — and a failed
// creation falls back to the defaults in memory with the problem named.
export function readRolesFile(home: string, root: string): RolesRead {
  const homePath = path.join(home, '.janissary', FILE_NAME);
  const projectPath = path.join(root, '.janissary', FILE_NAME);
  const candidates: Array<{ path: string; source: 'home' | 'project' }> = [];
  if (existsSync(projectPath)) candidates.push({ path: projectPath, source: 'project' });
  if (existsSync(homePath)) candidates.push({ path: homePath, source: 'home' });
  let broken: string | undefined;
  let brokenPath = projectPath;
  for (const candidate of candidates) {
    const attempt = readAt(candidate.path, candidate.source);
    if (!attempt.ok) {
      broken ??= attempt.problem;
      brokenPath = candidate.path;
      continue;
    }
    if (broken) {
      return { ...attempt.read, problem: `${broken} — showing the ${candidate.source} roles file.` };
    }
    return attempt.read;
  }
  if (candidates.length === 0 && createDefaultFile(homePath)) {
    return { roles: [...DEFAULT_ROLES], source: 'home', path: homePath };
  }
  const reason = broken ?? `roles.json could not be created at ${homePath}`;
  return {
    roles: [...DEFAULT_ROLES],
    source: 'default',
    path: brokenPath,
    problem: `${reason} — showing default roles.`,
  };
}

// Write the roles as the file's object shape, keyed by role name in the order given — so the file's
// key order is the role order the tab shows. Answers whether the write succeeded; a failure leaves
// both the file and the caller's state alone.
export function writeRolesFile(filePath: string, roles: readonly Role[]): boolean {
  const contents: Record<string, { description: string; entries: RoleEntry[] }> = {};
  for (const role of roles) {
    contents[role.name] = { description: role.description, entries: role.entries };
  }
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(contents, undefined, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}
