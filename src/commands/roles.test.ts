import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Os from 'node:os';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Role } from '../plugins/roles/shared.js';
import { findCommand } from './index.js';
import { command, rolesListing, ROLES_LIST_USAGE } from './roles.js';

const state = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof Os>();
  return { ...actual, homedir: () => state.home };
});

const roots: string[] = [];

beforeEach(() => {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-roles-command-'));
  roots.push(base);
  state.home = path.join(base, 'home');
  mkdirSync(state.home, { recursive: true });
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function writeRoles(roles: Record<string, unknown>): void {
  const file = path.join(state.home, '.janissary', 'roles.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(roles));
}

function run(input: string, models: Record<string, string[]> = {}) {
  const append = vi.fn();
  const reload = vi.fn();
  const managers = {
    tab: { append, launchDir: path.join(roots.at(-1)!, 'project') },
    models: { reload, modelsFor: vi.fn((name: string) => models[name] ?? []) },
  } as unknown as Managers;
  command.run(input, { label: 'janus', index: 0 }, managers);
  return { append, reload };
}

function outputOf(append: ReturnType<typeof vi.fn>): string {
  expect(append).toHaveBeenCalledTimes(1);
  return append.mock.calls[0][1].output as string;
}

describe('roles list command', () => {
  it('takes only roles list for the built-in and leaves bare roles to the plugin claim', () => {
    expect(findCommand('roles', 'roles list')).toBe(command);
    expect(findCommand('roles', 'roles')).not.toBe(command);
    expect(command.match('ROLES LIST')).toBe(true);
  });

  it('prints pretty JSON of each role with its enabled models and commands', () => {
    writeRoles({
      review: {
        description: 'Second pair of eyes.',
        entries: [
          { harness: 'opencode', model: 'enabled-model', effort: 'high' },
          { harness: 'opencode', model: 'disabled-model' },
        ],
        commands: ['file read', 'notify'],
      },
    });
    const { append, reload } = run('roles list', { opencode: ['enabled-model'] });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(outputOf(append)).toBe(JSON.stringify({
      roles: [{
        name: 'review',
        description: 'Second pair of eyes.',
        models: [{ harness: 'opencode', model: 'enabled-model', effort: 'high' }],
        commands: ['file read', 'notify'],
      }],
    }, null, 2));
  });

  it('prints an empty roles array for an empty roles file', () => {
    writeRoles({});
    const { append } = run('roles list');
    expect(outputOf(append)).toBe(JSON.stringify({ roles: [] }, null, 2));
  });

  it('reads the defaults without creating a roles file', () => {
    const { append } = run('roles list', { opencode: ['model'], claude: ['model'], codex: ['model'] });
    const parsed = JSON.parse(outputOf(append)) as { roles: Array<{ name: string }> };
    expect(parsed.roles.map((role) => role.name)).toContain('ask');
    expect(existsSync(path.join(state.home, '.janissary', 'roles.json'))).toBe(false);
  });

  it('refuses extra arguments without reading the model catalog', () => {
    const { append, reload } = run('roles list extra');
    expect(outputOf(append)).toBe(ROLES_LIST_USAGE);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('rolesListing', () => {
  it('keeps effort only when stored and copies the command grants', () => {
    const role: Role = {
      name: 'r', description: '', entries: [{ harness: 'codex', model: 'm' }], commands: ['notify', 'notify'],
    };
    expect(rolesListing([role], { models: { codex: ['m'] }, efforts: [] })).toEqual({
      roles: [{
        name: 'r', description: '',
        models: [{ harness: 'codex', model: 'm' }],
        commands: ['notify', 'notify'],
      }],
    });
  });
});
