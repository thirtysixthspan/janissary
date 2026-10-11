import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_ROLES, readRolesFile, writeRolesFile } from './roles-file.js';
import type { Role } from './shared.js';

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-roles-file-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

const homeFile = (home: string) => path.join(home, '.janissary', 'roles.json');
const projectFile = (root: string) => path.join(root, '.janissary', 'roles.json');

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value, undefined, 2));
}

function readJson(filePath: string): Record<string, { description: string; entries: unknown[] }> {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const A_ROLE: Role = { name: 'review', description: 'Second pair of eyes.', entries: [] };

describe('reading the roles in effect', () => {
  it('creates the home file with the default roles when neither file exists', () => {
    const { home, root } = directories();
    const read = readRolesFile(home, root);

    expect(read.source).toBe('home');
    expect(read.path).toBe(homeFile(home));
    expect(read.problem).toBeUndefined();
    expect(read.roles).toEqual(DEFAULT_ROLES);
    expect(readJson(homeFile(home))['planning'].entries).toHaveLength(2);
    expect(Object.keys(readJson(homeFile(home)))).toEqual(DEFAULT_ROLES.map((role) => role.name));
  });

  it('reads the home file when it is the only one', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });

    const read = readRolesFile(home, root);

    expect(read.source).toBe('home');
    expect(read.roles).toEqual([A_ROLE]);
  });

  it('replaces the home roles entirely with the project file, including an empty one', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });
    writeJson(projectFile(root), { planning: { description: 'Plans.', entries: [] } });

    const replaced = readRolesFile(home, root);
    expect(replaced.source).toBe('project');
    expect(replaced.roles.map((role) => role.name)).toEqual(['planning']);

    writeJson(projectFile(root), {});
    const emptied = readRolesFile(home, root);
    expect(emptied.source).toBe('project');
    expect(emptied.roles).toEqual([]);
    expect(emptied.problem).toBeUndefined();
  });

  it('keeps the roles that decode and reports the ones that do not', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      review: { description: 'Second pair of eyes.', entries: [{ harness: 'codex', model: 'gpt-6-sol' }, { effort: 'xhigh' }] },
      broken: { description: 'No entries list.' },
    });

    const read = readRolesFile(home, root);

    expect(read.roles).toEqual([{ ...A_ROLE, entries: [{ harness: 'codex', model: 'gpt-6-sol' }] }]);
    expect(read.problem).toBe(
      `roles.json dropped 2 malformed roles or entries at ${homeFile(home)} — showing the rest of this file.`,
    );
  });

  it('falls back along the chain and names the file that broke', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });
    mkdirSync(path.dirname(projectFile(root)), { recursive: true });
    writeFileSync(projectFile(root), '{ broken', 'utf8');

    const fromHome = readRolesFile(home, root);
    expect(fromHome.source).toBe('home');
    expect(fromHome.problem).toBe(`roles.json is not valid JSON at ${projectFile(root)} — showing the home roles file.`);
    expect(fromHome.roles).toEqual([A_ROLE]);

    writeFileSync(projectFile(root), '{ broken too', 'utf8');
    writeFileSync(homeFile(home), '{ broken', 'utf8');
    const defaults = readRolesFile(home, root);
    expect(defaults.source).toBe('default');
    expect(defaults.roles).toEqual(DEFAULT_ROLES);
    expect(defaults.problem).toBe(
      `roles.json is not valid JSON at ${projectFile(root)} — showing default roles.`,
    );
  });

  it('leaves a broken file untouched on disk', () => {
    const { home, root } = directories();
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    writeFileSync(homeFile(home), '{ broken', 'utf8');

    readRolesFile(home, root);

    expect(readFileSync(homeFile(home), 'utf8')).toBe('{ broken');
  });

  it('reports a file that is not a set of roles', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), ['not', 'a', 'set']);

    const read = readRolesFile(home, root);

    expect(read.source).toBe('default');
    expect(read.problem).toBe(`roles.json is not a set of roles at ${homeFile(home)} — showing default roles.`);
  });

  it('reports a roles path that cannot be read as a creation problem', () => {
    const { home, root } = directories();
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    // A directory where the file belongs makes every write of it fail, including the creation.
    mkdirSync(homeFile(home), { recursive: true });

    const read = readRolesFile(home, root);

    expect(read.source).toBe('default');
    expect(read.roles).toEqual(DEFAULT_ROLES);
    expect(read.problem).toContain(`roles.json could not be read at ${homeFile(home)} — showing default roles.`);
  });
});

describe('writing the roles in effect', () => {
  it('writes the roles object keyed by name in order, with effort only when stored', () => {
    const { home, root } = directories();
    const file = projectFile(root);
    const roles: Role[] = [
      {
        name: 'planning',
        description: 'Plans.',
        entries: [
          { harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' },
          { harness: 'claude', model: 'claude-opus-5-5' },
        ],
      },
      A_ROLE,
    ];

    expect(writeRolesFile(file, roles)).toBe(true);

    expect(readJson(file)).toEqual({
      planning: {
        description: 'Plans.',
        entries: [{ harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' }, { harness: 'claude', model: 'claude-opus-5-5' }],
      },
      review: { description: 'Second pair of eyes.', entries: [] },
    });
    expect(Object.keys(readJson(file))).toEqual(['planning', 'review']);
    expect(readRolesFile(home, root).roles).toEqual(roles);
  });

  it('reports a write that cannot happen rather than throwing', () => {
    const { root } = directories();
    mkdirSync(projectFile(root), { recursive: true });

    expect(writeRolesFile(projectFile(root), DEFAULT_ROLES)).toBe(false);
    expect(existsSync(projectFile(root))).toBe(true);
  });
});