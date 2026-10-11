import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection,
  type TabPluginIntent,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
} from '../api.js';
import { activate } from './activate.js';
import { DEFAULT_ROLES } from './roles-file.js';
import { isRolesPayload, type RolesPayload } from './shared.js';

const CATALOG = { models: { codex: ['gpt-6-sol'] }, efforts: ['low', 'xhigh'] };

type WrittenFile = Record<string, { description: string; entries: Array<{ model: string }> }>;

function fixture(): {
  home: string;
  capabilities: TabPluginServerCapabilities;
  opened: Array<{ key: string; value: TabPluginPayload }>;
  updated: Array<{ key: string; value: TabPluginTabUpdate }>;
} {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-roles-activate-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  const opened: Array<{ key: string; value: TabPluginPayload }> = [];
  const updated: Array<{ key: string; value: TabPluginTabUpdate }> = [];
  const capabilities = {
    originTab: () => ({ label: 'x', cwd: root, root }),
    openOrFocusTab: (key: string, make: () => TabPluginPayload) => { opened.push({ key, value: make() }); },
    updateTab: (key: string, make: () => TabPluginTabUpdate) => { updated.push({ key, value: make() }); },
    harnessLaunchCatalog: () => CATALOG,
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { home, capabilities, opened, updated };
}

const rolesPath = (home: string) => path.join(home, '.janissary', 'roles.json');

const roleNames = (home: string): string[] =>
  Object.keys(JSON.parse(readFileSync(rolesPath(home), 'utf8')) as Record<string, unknown>);

// A tab payload of the shape the tab really holds, so an intent is dispatched through the plugin's
// own guard exactly as a client's would be.
const payloadFor = (home: string, source: RolesPayload['source'] = 'home'): RolesPayload => ({
  roles: [],
  source,
  path: rolesPath(home),
  catalog: CATALOG,
});

function send(
  activation: ReturnType<typeof activate>,
  name: string,
  payload: unknown,
  capabilities: TabPluginServerCapabilities,
  tabPayload: RolesPayload,
): unknown {
  const request: TabPluginIntent = { tab: 'roles', intent: name, payload, tabPayload };
  return activation.intent(request, capabilities);
}

describe('the roles command', () => {
  it('opens the singleton tab with the roles, the file in effect, and the catalog', () => {
    const { home, capabilities, opened } = fixture();
    const activation = activate(home);

    activation.command?.('', capabilities);

    expect(opened).toHaveLength(1);
    expect(opened[0].key).toBe('roles');
    expect(opened[0].value.title).toBe('roles');
    const payload = opened[0].value.payload as RolesPayload;
    expect(isRolesPayload(payload)).toBe(true);
    expect(payload.roles).toEqual([...DEFAULT_ROLES]);
    expect(payload.source).toBe('home');
    expect(payload.path).toBe(rolesPath(home));
    expect(payload.catalog).toEqual(CATALOG);
  });

  it('answers an argument with a usage refusal and opens nothing', () => {
    const { home, capabilities, opened } = fixture();
    const activation = activate(home);

    expect(() => activation.command?.('left', capabilities)).toThrow('Usage: roles');
    expect(opened).toEqual([]);
  });
});

describe('editing roles through intents', () => {
  it('adds, describes, and deletes a role, writing the file each time', async () => {
    const { home, capabilities, updated } = fixture();
    const activation = activate(home);
    const tab = payloadFor(home);

    await send(activation, 'add-role', { name: 'review' }, capabilities, tab);
    await send(activation, 'describe-role', { name: 'review', description: 'Second pair of eyes.', expected: '' }, capabilities, tab);
    await send(activation, 'delete-role', { name: 'review' }, capabilities, tab);

    expect(roleNames(home)).toEqual(DEFAULT_ROLES.map((role) => role.name));
    expect(updated).toHaveLength(3);
  });

it('adds an entry, sets and clears its effort, then moves and removes it', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    const tab = payloadFor(home);
    // `research` is one of the defaults with no entries yet, so the list under test holds only what
    // this test puts in it.
    const entryModels = () => {
      const file = JSON.parse(readFileSync(rolesPath(home), 'utf8')) as Record<string, { entries: Array<{ model: string }> }>;
      return file['research'].entries.map((entry) => entry.model);
    };

    await send(activation, 'add-entry', { role: 'research', entry: { harness: 'codex', model: 'gpt-6-sol' } }, capabilities, tab);
    await send(activation, 'add-entry', { role: 'research', entry: { harness: 'codex', model: 'second' } }, capabilities, tab);
    expect(entryModels()).toEqual(['gpt-6-sol', 'second']);

    await send(activation, 'set-entry-effort', { role: 'research', index: 1, effort: 'xhigh' }, capabilities, tab);
    let file = JSON.parse(readFileSync(rolesPath(home), 'utf8')) as Record<string, { entries: Array<{ effort?: string }> }>;
    expect(file['research'].entries[1].effort).toBe('xhigh');

    await send(activation, 'set-entry-effort', { role: 'research', index: 1, effort: null }, capabilities, tab);
    file = JSON.parse(readFileSync(rolesPath(home), 'utf8')) as Record<string, { entries: Array<{ effort?: string }> }>;
    expect(file['research'].entries[1].effort).toBeUndefined();

    await send(activation, 'move-entry', { role: 'research', from: 1, to: 0 }, capabilities, tab);
    expect(entryModels()).toEqual(['second', 'gpt-6-sol']);

    await send(activation, 'remove-entry', { role: 'research', index: 1 }, capabilities, tab);
    expect(entryModels()).toEqual(['second']);
  });

  it('moves a role to a position and renames it in place', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    const tab = payloadFor(home);

    await send(activation, 'move-role', { name: 'planning', to: 2 }, capabilities, tab);
    expect(roleNames(home).slice(0, 3)).toEqual(['research', 'code review', 'planning']);

    await send(activation, 'rename-role', { name: 'code review', next: 'review' }, capabilities, tab);
    const names = roleNames(home);
    expect(names[1]).toBe('review');
    expect(names).toHaveLength(DEFAULT_ROLES.length);
  });

  it('refuses a duplicate role name case-insensitively and writes nothing', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    // The command creates the default file first, so the duplicate is refused against a file that
    // already holds a `planning` role.
    activation.command?.('', capabilities);
    const before = readFileSync(rolesPath(home), 'utf8');

    await expect(send(activation, 'add-role', { name: 'PLANNING' }, capabilities, payloadFor(home)))
      .rejects.toThrow('A role named "PLANNING" already exists.');

    expect(readFileSync(rolesPath(home), 'utf8')).toBe(before);
  });

  it('refuses a rename that would collide, and refuses an edit on a role that is not there', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    const tab = payloadFor(home);

    await expect(send(activation, 'rename-role', { name: 'research', next: 'PLANNING' }, capabilities, tab))
      .rejects.toThrow('A role named "PLANNING" already exists.');
    await expect(send(activation, 'delete-role', { name: 'nothing' }, capabilities, tab))
      .rejects.toThrow('No role named "nothing".');
  });

  it('refuses a description written against text the file no longer holds, and writes nothing', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    await send(activation, 'add-role', { name: 'review' }, capabilities, payloadFor(home));
    const before = readFileSync(rolesPath(home), 'utf8');

    await expect(send(activation, 'describe-role', { name: 'review', description: 'Second pair of eyes.', expected: 'Another client got here first.' }, capabilities, payloadFor(home)))
      .rejects.toThrow('The description of role "review" changed elsewhere — nothing was written.');

    expect(readFileSync(rolesPath(home), 'utf8')).toBe(before);
  });

  it('writes a description written against the text the file still holds, leaving the rest alone', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    await send(activation, 'add-role', { name: 'review' }, capabilities, payloadFor(home));
    await send(activation, 'add-entry', { role: 'review', entry: { harness: 'codex', model: 'gpt-6-sol' } }, capabilities, payloadFor(home));

    await send(activation, 'describe-role', { name: 'review', description: 'Second pair of eyes.', expected: '' }, capabilities, payloadFor(home));

    const file = JSON.parse(readFileSync(rolesPath(home), 'utf8')) as WrittenFile;
    expect(file['review'].description).toBe('Second pair of eyes.');
    expect(file['review'].entries.map((entry) => entry.model)).toEqual(['gpt-6-sol']);
    expect(roleNames(home)).toContain('planning');
  });

  it('refuses every edit while the file in effect is unusable, leaving the broken file alone', async () => {
    const { home, capabilities } = fixture();
    mkdirSync(path.dirname(rolesPath(home)), { recursive: true });
    writeFileSync(rolesPath(home), '{ broken');
    const activation = activate(home);

    await expect(send(activation, 'add-role', { name: 'review' }, capabilities, payloadFor(home)))
      .rejects.toThrow(`roles.json at ${rolesPath(home)} is unusable — fix the file before editing roles.`);

    expect(readFileSync(rolesPath(home), 'utf8')).toBe('{ broken');
  });

  it('refuses an edit while the file in effect is only partly damaged, leaving it untouched', async () => {
    const { home, capabilities } = fixture();
    mkdirSync(path.dirname(rolesPath(home)), { recursive: true });
    const damaged = JSON.stringify({
      review: { description: 'Second pair of eyes.', entries: [] },
      broken: { description: 'No entries list.' },
    }, undefined, 2);
    writeFileSync(rolesPath(home), damaged);
    const activation = activate(home);

    await expect(send(activation, 'describe-role', { name: 'review', description: 'Changed.', expected: 'Second pair of eyes.' }, capabilities, payloadFor(home)))
      .rejects.toThrow(`roles.json at ${rolesPath(home)} is unusable — fix the file before editing roles.`);

    expect(readFileSync(rolesPath(home), 'utf8')).toBe(damaged);
  });

  it('refuses a malformed intent payload before it reaches the file', () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);

    expect(() => send(activation, 'add-role', { name: '' }, capabilities, payloadFor(home)))
      .toThrow('invalid add-role payload');
    expect(() => send(activation, 'describe-role', { name: 'review', description: 'x' }, capabilities, payloadFor(home)))
      .toThrow('invalid describe-role payload');
    expect(() => send(activation, 'nope', {}, capabilities, payloadFor(home)))
      .toThrow('unknown roles intent "nope"');
  });

  it('serializes two rapid edits so the second reads the first', async () => {
    const { home, capabilities } = fixture();
    const activation = activate(home);
    const tab = payloadFor(home);

    await Promise.all([
      send(activation, 'add-role', { name: 'review' }, capabilities, tab),
      send(activation, 'add-role', { name: 'docs' }, capabilities, tab),
    ]);

    expect(roleNames(home)).toEqual([
      'planning', 'research', 'code review', 'implementation', 'documentation', 'review', 'docs',
    ]);
  });

  it('republishes a payload the tab can use after every successful edit', async () => {
    const { home, capabilities, updated } = fixture();
    const activation = activate(home);

    await send(activation, 'add-role', { name: 'review' }, capabilities, payloadFor(home));

    expect(updated).toHaveLength(1);
    const payload = updated[0].value.payload as RolesPayload;
    expect(isRolesPayload(payload)).toBe(true);
    expect(payload.roles.map((role) => role.name)).toContain('review');
  });
});