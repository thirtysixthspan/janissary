import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginIntent,
  type TabPluginOriginTab,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
} from '../api.js';
import { activate } from './activate.js';
import type { HostRow, HostsPayload } from './shared.js';

const dirs = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, homedir: () => dirs.home };
});

type Notification = { text: string; options?: { tab?: string } };
type DispatchResult = Awaited<ReturnType<TabPluginServerCapabilities['dispatchLineWithOutput']>>;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function writeCatalog(dir: string, value: unknown): string {
  const file = path.join(dir, '.janissary', 'hosts.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  return file;
}

function row(name: string, destination: string): HostRow {
  return { name, user: '', destination, path: '' };
}

function fixture(): {
  activation: TabPluginActivation;
  capabilities: TabPluginServerCapabilities;
  home: string;
  root: string;
  events: string[];
  opened: Array<{ key: string; value: TabPluginPayload }>;
  updated: Array<{ key: string; value: TabPluginTabUpdate }>;
  noted: string[];
  notifications: Notification[];
  dispatch: ReturnType<typeof vi.fn>;
  tabPayload(rows?: HostRow[]): HostsPayload;
  setOrigin(origin: TabPluginOriginTab): void;
  setDispatch(result: DispatchResult): void;
} {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-hosts-activate-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  dirs.home = home;

  let origin: TabPluginOriginTab = { label: 'hosts', cwd: '/workspace/ws', root };
  const events: string[] = [];
  const opened: Array<{ key: string; value: TabPluginPayload }> = [];
  const updated: Array<{ key: string; value: TabPluginTabUpdate }> = [];
  const noted: string[] = [];
  const notifications: Notification[] = [];
  const dispatch = vi.fn(async (): Promise<DispatchResult> => ({ dispatched: true, output: '' }));
  const capabilities = {
    originTab: () => origin,
    openOrFocusTab: (key: string, make: () => TabPluginPayload) => {
      events.push(`open:${key}`);
      opened.push({ key, value: make() });
    },
    updateTab: (key: string, make: () => TabPluginTabUpdate) => {
      events.push(`update:${key}`);
      updated.push({ key, value: make() });
    },
    note: (text: string) => { events.push(`note:${text}`); noted.push(text); },
    notifyUser: (text: string, options?: { tab?: string }) => { notifications.push({ text, options }); },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
    dispatchLineWithOutput: dispatch,
  } as unknown as TabPluginServerCapabilities;
  return {
    activation: activate(), capabilities, home, root, events, opened, updated, noted,
    notifications, dispatch,
    tabPayload: (rows: HostRow[] = []) => ({ filePath: path.join(root, '.janissary', 'hosts.json'), rows }),
    setOrigin: (value) => { origin = value; },
    setDispatch: (result) => { dispatch.mockResolvedValue(result); },
  };
}

function runCommand(f: ReturnType<typeof fixture>, argument: string): void {
  const command = f.activation.command;
  if (command === undefined) throw new Error('hosts plugin has no command');
  command(argument, f.capabilities);
}

function send(
  f: ReturnType<typeof fixture>, intent: string, payload: unknown, tabPayload?: HostsPayload,
): unknown {
  const request: TabPluginIntent = {
    tab: 'hosts', intent, payload, tabPayload: tabPayload ?? f.tabPayload(),
  };
  return f.activation.intent(request, f.capabilities);
}

function refusal(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    if (error instanceof TabPluginRejection) return error.message;
    throw error;
  }
  throw new Error('expected a rejection');
}

async function asyncRefusal(work: () => unknown): Promise<string> {
  try {
    await work();
  } catch (error) {
    if (error instanceof TabPluginRejection) return error.message;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('hosts activation command', () => {
  it('reads once and updates the open tab before focusing a fresh instance', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    runCommand(f, '');

    expect(f.events).toEqual(['update:hosts', 'open:hosts']);
    expect(f.opened[0]?.value).toEqual({
      title: 'hosts',
      payload: {
        filePath: path.join(f.root, '.janissary', 'hosts.json'),
        rows: [row('Lab', 'lab.local')],
      },
    });
    expect(f.updated[0]?.value.payload).toEqual(f.opened[0]?.value.payload);
  });

  it('focuses a repeat command with rows reread from the file', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    runCommand(f, '');
    writeCatalog(f.root, { Lab: { destination: 'new.local' }, Other: { destination: 'other.local' } });

    runCommand(f, ' ');

    expect(f.events).toEqual(['update:hosts', 'open:hosts', 'update:hosts', 'open:hosts']);
    expect(f.updated[1]?.value.payload).toEqual({
      filePath: path.join(f.root, '.janissary', 'hosts.json'),
      rows: [row('Lab', 'new.local'), row('Other', 'other.local')],
    });
  });

  it('reads from the origin root rather than a workspace cwd', () => {
    const f = fixture();
    writeCatalog(f.home, { Home: { destination: 'home.local' } });
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    f.setOrigin({ label: 'hosts', cwd: '/workspace/ws', root: f.root, workspace: undefined });

    runCommand(f, '');

    expect(f.opened[0]?.value.payload).toEqual({
      filePath: path.join(f.root, '.janissary', 'hosts.json'),
      rows: [row('Lab', 'lab.local')],
    });
  });

  it('notes plain output without opening a tab', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { user: 'ops', destination: 'lab.local:2222', path: '~/work' } });

    runCommand(f, 'list');

    expect(f.noted).toEqual(['{\n  "Lab": {\n    "user": "ops",\n    "destination": "lab.local:2222",\n    "path": "~/work"\n  }\n}']);
    expect(f.opened).toEqual([]);
    expect(f.updated).toEqual([]);
  });

  it('refuses unsupported forms and docking arguments', () => {
    const f = fixture();
    expect(refusal(() => runCommand(f, 'show'))).toBe('Usage: hosts [list|add|remove].');
    expect(refusal(() => runCommand(f, 'left'))).toBe('Usage: hosts [list|add|remove].');
    expect(refusal(() => runCommand(f, 'right'))).toBe('Usage: hosts [list|add|remove].');
    expect(f.noted).toEqual([]);
    expect(f.updated).toEqual([]);
  });

  it('publishes the written catalog after a successful add and remove without rereading', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    runCommand(f, 'add Other other.local');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      Lab: { destination: 'lab.local' }, Other: { destination: 'other.local' },
    });
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'lab.local'), row('Other', 'other.local')],
    });
    expect(f.noted).toEqual(['Host Other added.']);

    runCommand(f, 'remove other');
    expect(f.updated[1]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'lab.local')],
    });
    expect(f.noted).toEqual(['Host Other added.', 'Host Other removed.']);
  });

  it('leaves the payload alone when a mutation is refused', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    expect(refusal(() => runCommand(f, 'remove ghost'))).toBe('No host named "ghost".');

    expect(f.updated).toEqual([]);
    expect(f.noted).toEqual([]);
    expect(readFileSync(path.join(f.root, '.janissary', 'hosts.json'), 'utf8')).toContain('Lab');
  });

  it('declines a command whose origin tab has closed', () => {
    const f = fixture();
    f.setOrigin(null);
    expect(refusal(() => runCommand(f, ''))).toBe('The Hosts tab has no origin.');
    expect(f.opened).toEqual([]);
  });
});

describe('hosts activation intents', () => {
  it('refreshes from a fresh read and publishes through the same update path', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeCatalog(f.root, { Lab: { destination: 'new.local' }, New: { destination: 'new.local' } });

    expect(send(f, 'refresh', {}, f.tabPayload([row('Lab', 'lab.local')]))).toBeNull();

    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'new.local'), row('New', 'new.local')],
    });
    expect(f.notifications).toEqual([]);
  });

  it('rejects an unknown intent and a malformed intent payload', () => {
    const f = fixture();
    expect(refusal(() => send(f, 'bogus', {}))).toBe('unknown hosts intent "bogus"');
    expect(refusal(() => send(f, 'open', { name: 7 }))).toBe('invalid open payload');
    expect(refusal(() => send(f, 'refresh', { extra: true }))).toBe('invalid refresh payload');
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('reports an invalid tab payload as a failure rather than a request', () => {
    const f = fixture();
    expect(() => send(f, 'refresh', {}, {})).toThrow('invalid hosts tab payload');
  });

  it('rejects an open for a name the tab did not offer', async () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    expect(await asyncRefusal(() => send(f, 'open', { name: 'Ghost' }, f.tabPayload([row('Lab', 'lab.local')]))))
      .toBe('no host row "Ghost"');
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('publishes a fresh payload and notifies when an offered row has gone', async () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Other: { destination: 'other.local' } });

    expect(await send(f, 'open', { name: 'Lab' }, f.tabPayload([row('Lab', 'lab.local')]))).toBeNull();

    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Other', 'other.local')],
    });
    expect(f.notifications).toEqual([
      { text: 'No host named "Lab".', options: { tab: 'hosts' } },
    ]);
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches the stored spelling of an offered row and stays quiet on success', async () => {
    const f = fixture();
    writeCatalog(f.root, { LAB: { destination: 'lab.local' } });

    expect(await send(f, 'open', { name: 'lab' }, f.tabPayload([row('LAB', 'lab.local')]))).toBeNull();

    expect(f.dispatch).toHaveBeenCalledExactlyOnceWith('ssh LAB');
    expect(f.notifications).toEqual([]);
    expect(f.updated).toEqual([]);
  });

  it('forwards an immediate dispatch error to the Hosts tab', async () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    f.setDispatch({ dispatched: true, output: '', result: 'No host named "Lab".' });

    await send(f, 'open', { name: 'Lab' }, f.tabPayload([row('Lab', 'lab.local')]));

    expect(f.notifications).toEqual([
      { text: 'No host named "Lab".', options: { tab: 'hosts' } },
    ]);
  });

  it('forwards a refused dispatch and reports an unclaimed one', async () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    f.setDispatch({ dispatched: true, output: 'Command is disabled: ssh.' });
    await send(f, 'open', { name: 'Lab' }, f.tabPayload([row('Lab', 'lab.local')]));
    expect(f.notifications.at(-1)).toEqual({
      text: 'Command is disabled: ssh.', options: { tab: 'hosts' },
    });

    f.setDispatch({ dispatched: false, output: '' });
    await send(f, 'open', { name: 'Lab' }, f.tabPayload([row('Lab', 'lab.local')]));
    expect(f.notifications.at(-1)).toEqual({
      text: 'Could not open host "Lab".', options: { tab: 'hosts' },
    });
  });

  it('attributes malformed-file notifications from an intent to the Hosts tab', () => {
    const f = fixture();
    writeCatalog(f.root, '{bad json');

    send(f, 'refresh', {});

    expect(f.notifications[0]?.text).toContain('is unusable');
    expect(f.notifications[0]?.options).toEqual({ tab: 'hosts' });
  });

});
