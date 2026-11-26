import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
import type { HostRow, HostsPayload, SaveHostResult } from './shared.js';

const dirs = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, homedir: () => dirs.home };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

type Notification = { text: string; options?: { tab?: string } };
type DispatchResult = Awaited<ReturnType<TabPluginServerCapabilities['dispatchLineWithOutput']>>;

const roots: string[] = [];

afterEach(() => {
  vi.mocked(writeFileSync).mockClear();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function writeCatalog(dir: string, value: unknown): string {
  const file = path.join(dir, '.janissary', 'hosts.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  return file;
}

function writeText(file: string, text: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function writeSshConfig(dir: string, text: string): string {
  return writeText(path.join(dir, '.ssh', 'config'), text);
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

function savePayload(name: string, destination: string, originalName?: string): unknown {
  const base = { name, user: '', destination, path: '' };
  return originalName === undefined ? base : { ...base, originalName };
}

function sendSave(
  f: ReturnType<typeof fixture>, payload: unknown, tabPayload?: HostsPayload,
): SaveHostResult {
  return send(f, 'save', payload, tabPayload) as SaveHostResult;
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
    expect(refusal(() => runCommand(f, 'show'))).toBe('Usage: hosts [list|add|remove|import|export].');
    expect(refusal(() => runCommand(f, 'left'))).toBe('Usage: hosts [list|add|remove|import|export].');
    expect(refusal(() => runCommand(f, 'right'))).toBe('Usage: hosts [list|add|remove|import|export].');
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

describe('hosts activation ssh commands', () => {
  it('notes a local import, publishes the written catalog, and never opens a tab', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, 'Host web1\n  HostName web1.example\n');

    runCommand(f, 'import');

    expect(f.noted).toEqual(['Imported 1 host from ~/.ssh/config.']);
    expect(f.opened).toEqual([]);
    expect(f.events).not.toContain('open:hosts');
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'lab.local'), row('web1', 'web1.example')],
    });
  });

  it('notes a local export report without publishing or opening a tab', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    runCommand(f, 'export');

    expect(f.noted).toEqual(['Exported 1 host to ~/.ssh/config.']);
    expect(f.opened).toEqual([]);
    expect(f.updated).toEqual([]);
  });

  it('executes valid verbs through the runner rather than returning the usage checkpoint', () => {
    const imported = fixture();
    writeCatalog(imported.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(imported.home, 'Host web1\n  HostName web1.example\n');
    runCommand(imported, 'IMPORT');

    const exported = fixture();
    writeCatalog(exported.root, { Lab: { destination: 'lab.local' } });
    runCommand(exported, 'EXPORT');

    expect(imported.noted).toEqual(['Imported 1 host from ~/.ssh/config.']);
    expect(exported.noted).toEqual(['Exported 1 host to ~/.ssh/config.']);
    expect(imported.noted).not.toContain('Usage: hosts import [file]');
    expect(exported.noted).not.toContain('Usage: hosts export [file]');
  });

  it('still refuses malformed import and export forms in the transcript', () => {
    const f = fixture();
    expect(refusal(() => runCommand(f, 'import a b'))).toBe('Usage: hosts import [file]');
    expect(refusal(() => runCommand(f, 'export "unclosed'))).toBe('Usage: hosts export [file]');
    expect(f.noted).toEqual([]);
    expect(f.updated).toEqual([]);
  });

  it('notes an empty import report without publishing or writing', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, '');
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    runCommand(f, 'import');

    expect(f.noted).toEqual(['No aliases to import from ~/.ssh/config.']);
    expect(f.updated).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('refuses a failed import without publishing or writing the catalog', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'import')))
      .toBe('Cannot read ssh config ~/.ssh/config: no such file.');

    expect(f.updated).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('reports a missing import file with an abbreviated path', () => {
    const f = fixture();
    expect(refusal(() => runCommand(f, 'import ~/missing')))
      .toBe('Cannot read ssh config ~/missing: no such file.');
    expect(f.updated).toEqual([]);
  });

  it('refuses a failed export in the transcript without opening a tab', () => {
    const f = fixture();
    writeCatalog(f.home, '{bad json');

    expect(refusal(() => runCommand(f, 'export')))
      .toBe(`Cannot export hosts: ${path.join(f.home, '.janissary', 'hosts.json')} is unusable — fix it by hand.`);

    expect(f.opened).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.notifications[0]?.text).toContain('is unusable');
  });

  it('refuses both verbs in a remote tab before touching any file', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, 'Host web1\n  HostName web1.example\n');
    f.setOrigin({ label: 'hosts', cwd: f.root, root: f.root, remote: true });
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'import')))
      .toBe('hosts import and hosts export work only in local tabs.');
    expect(refusal(() => runCommand(f, 'export')))
      .toBe('hosts import and hosts export work only in local tabs.');

    expect(f.noted).toEqual([]);
    expect(f.opened).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('resolves a relative import operand against the tab cwd before the root', () => {
    const f = fixture();
    const cwd = path.join(f.root, 'tab-cwd');
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeText(path.join(cwd, 'config'), 'Host fromcwd\n  HostName cwd.example\n');
    writeText(path.join(f.root, 'config'), 'Host fromroot\n  HostName root.example\n');
    f.setOrigin({ label: 'hosts', cwd, root: f.root });

    runCommand(f, 'import config');

    expect(f.noted).toEqual(['Imported 1 host from $root/tab-cwd/config.']);
    expect(f.updated[0]?.value.payload.rows).toEqual([
      row('fromcwd', 'cwd.example'), row('Lab', 'lab.local'),
    ]);
  });

  it('falls back to the root when a relative operand is absent from the cwd', () => {
    const f = fixture();
    const cwd = path.join(f.root, 'tab-cwd');
    mkdirSync(cwd, { recursive: true });
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeText(path.join(f.root, 'config'), 'Host fromroot\n  HostName root.example\n');
    f.setOrigin({ label: 'hosts', cwd, root: f.root });

    runCommand(f, 'import config');

    expect(f.noted).toEqual(['Imported 1 host from $root/config.']);
    expect(f.updated[0]?.value.payload.rows).toEqual([
      row('fromroot', 'root.example'), row('Lab', 'lab.local'),
    ]);
  });

  it('refuses an export aimed at the home catalog without touching either catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'export ~/.janissary/hosts.json')))
      .toBe('Cannot export hosts: ~/.janissary/hosts.json is the hosts catalog and cannot be an export target.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
  });

  it('refuses an export aimed at the project catalog without touching either catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'export $root/.janissary/hosts.json')))
      .toBe('Cannot export hosts: $root/hosts.json is the hosts catalog and cannot be an export target.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
  });

  it('refuses a dot-dot spelling that resolves to the home catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'export ~/.janissary/../.janissary/hosts.json')))
      .toBe('Cannot export hosts: ~/.janissary/hosts.json is the hosts catalog and cannot be an export target.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });

  it('refuses an export that reaches the home catalog through a symlink', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const alias = path.join(f.home, 'aliased.json');
    symlinkSync(homeFile, alias);
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'export ~/aliased.json')))
      .toBe('Cannot export hosts: ~/aliased.json is the hosts catalog and cannot be an export target.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });

  it('refuses an import whose source is the home catalog without touching either catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'import ~/.janissary/hosts.json')))
      .toBe('Cannot import hosts: ~/.janissary/hosts.json is the hosts catalog and cannot be an import source.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
  });

  it('refuses an export through a dangling link that names the project catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const alias = path.join(f.home, 'dangling.json');
    symlinkSync(`${path.join(f.root, '.janissary')}/absent/../hosts.json`, alias);
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'export ~/dangling.json')))
      .toBe('Cannot export hosts: ~/dangling.json is the hosts catalog and cannot be an export target.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
  });

  it('refuses an import through a dangling link that names the project catalog', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    const projectFile = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const alias = path.join(f.home, 'dangling.json');
    symlinkSync(`${path.join(f.root, '.janissary')}/absent/../hosts.json`, alias);
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => runCommand(f, 'import ~/dangling.json')))
      .toBe('Cannot import hosts: ~/dangling.json is the hosts catalog and cannot be an import source.');

    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
  });

  it('exports through a dangling link to an ordinary config path', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const alias = path.join(f.home, 'ordinary.json');
    const target = path.join(f.home, 'plain-config');
    symlinkSync(target, alias);

    runCommand(f, 'export ~/ordinary.json');

    expect(f.noted).toEqual(['Exported 1 host to ~/ordinary.json.']);
    expect(readFileSync(target, 'utf8')).toContain('Host Lab');
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

  it('rejects malformed edit payloads before touching the file or the tab', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');

    expect(refusal(() => send(f, 'save', { name: 7 }))).toBe('invalid save payload');
    expect(refusal(() => send(f, 'delete', { name: '' }))).toBe('invalid delete payload');

    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(f.updated).toEqual([]);
  });

  it('creates a host and publishes the sorted written catalog exactly once', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    expect(sendSave(f, savePayload('Other', 'other.local'))).toEqual({ ok: true, name: 'Other' });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      Lab: { destination: 'lab.local' }, Other: { destination: 'other.local' },
    });
    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'lab.local'), row('Other', 'other.local')],
    });
    expect(f.notifications).toEqual([]);
  });

  it('refuses a create whose name is already taken regardless of case', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');

    expect(sendSave(f, savePayload('lab', 'new.local')))
      .toEqual({ ok: false, error: 'Host "lab" already exists.' });

    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(f.updated).toEqual([]);
  });

  it('edits a host under its own name without duplicating it', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });

    expect(sendSave(f, savePayload('Lab', 'new.local:2222', 'Lab')))
      .toEqual({ ok: true, name: 'Lab' });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ Lab: { destination: 'new.local:2222' } });
    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file, rows: [row('Lab', 'new.local:2222')],
    });
  });

  it('renames a host by case alone in one write', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { lab: { destination: 'lab.local' } });

    expect(sendSave(f, savePayload('Lab', 'lab.local', 'lab')))
      .toEqual({ ok: true, name: 'Lab' });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ Lab: { destination: 'lab.local' } });
    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file, rows: [row('Lab', 'lab.local')],
    });
  });

  it('refuses a rename that collides with another row', () => {
    const f = fixture();
    const file = writeCatalog(f.root, {
      Lab: { destination: 'lab.local' }, Other: { destination: 'other.local' },
    });
    const before = readFileSync(file, 'utf8');

    expect(sendSave(f, savePayload('Other', 'new.local', 'Lab')))
      .toEqual({ ok: false, error: 'Host "Other" already exists.' });

    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(f.updated).toEqual([]);
  });

  it('refuses an edit whose original row has gone', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Other: { destination: 'other.local' } });

    expect(sendSave(f, savePayload('Lab', 'lab.local', 'Lab')))
      .toEqual({ ok: false, error: 'No host named "Lab".' });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ Other: { destination: 'other.local' } });
    expect(f.updated).toEqual([]);
  });

  it('reports a stale deletion on the Hosts tab and keeps the current payload', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Other: { destination: 'other.local' } });
    const tab = f.tabPayload([row('Lab', 'lab.local')]);

    expect(send(f, 'delete', { name: 'Lab' }, tab)).toBeNull();

    expect(f.notifications).toEqual([
      { text: 'No host named "Lab".', options: { tab: 'hosts' } },
    ]);
    expect(f.updated).toEqual([]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ Other: { destination: 'other.local' } });
  });

  it('deletes a host and publishes the remaining catalog exactly once', () => {
    const f = fixture();
    const file = writeCatalog(f.root, {
      Lab: { destination: 'lab.local' }, Other: { destination: 'other.local' },
    });

    expect(send(f, 'delete', { name: 'lab' })).toBeNull();

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ Other: { destination: 'other.local' } });
    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file, rows: [row('Other', 'other.local')],
    });
    expect(f.notifications).toEqual([]);
  });

  it('keeps an entry added by hand after the tab opened', () => {
    const f = fixture();
    writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    runCommand(f, '');
    writeCatalog(f.root, {
      Lab: { destination: 'lab.local' }, Hand: { destination: 'hand.local' },
    });
    const file = path.join(f.root, '.janissary', 'hosts.json');

    expect(sendSave(f, savePayload('New', 'new.local'))).toEqual({ ok: true, name: 'New' });

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      Hand: { destination: 'hand.local' },
      Lab: { destination: 'lab.local' },
      New: { destination: 'new.local' },
    });
    expect(f.updated.at(-1)?.value.payload).toEqual({
      filePath: file,
      rows: [row('Hand', 'hand.local'), row('Lab', 'lab.local'), row('New', 'new.local')],
    });
  });

  it('returns the shared field error inline without writing', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');

    expect(sendSave(f, savePayload('bad name', 'lab.local')))
      .toEqual({ ok: false, error: 'Invalid name "bad name". Use letters, digits, and . - _ only.' });

    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(f.updated).toEqual([]);
  });

  it('returns the unusable-file diagnostic inline and attributes its warning', () => {
    const f = fixture();
    writeCatalog(f.home, []);

    const result = sendSave(f, savePayload('New', 'new.local'));

    expect(result).toEqual({
      ok: false,
      error: `Cannot save hosts: ${path.join(f.home, '.janissary', 'hosts.json')} is unusable — fix it by hand.`,
    });
    expect(f.notifications[0]?.text).toContain('is unusable');
    expect(f.notifications[0]?.options).toEqual({ tab: 'hosts' });
    expect(f.updated).toEqual([]);
  });

  it('returns the write-failure diagnostic inline and leaves the file untouched', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockImplementationOnce(() => { throw new Error('Disk full'); });

    expect(sendSave(f, savePayload('New', 'new.local')))
      .toEqual({ ok: false, error: `Could not write hosts.json at ${file}.` });

    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(f.updated).toEqual([]);
  });

  it('writes through the usable home file when the project override is bad', () => {
    const f = fixture();
    const homeFile = writeCatalog(f.home, { Home: { destination: 'home.local' } });
    writeCatalog(f.root, []);

    expect(sendSave(f, savePayload('New', 'new.local'))).toEqual({ ok: true, name: 'New' });

    expect(JSON.parse(readFileSync(homeFile, 'utf8'))).toEqual({
      Home: { destination: 'home.local' }, New: { destination: 'new.local' },
    });
    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: homeFile,
      rows: [row('Home', 'home.local'), row('New', 'new.local')],
    });
    expect(f.notifications[0]?.options).toEqual({ tab: 'hosts' });
  });
});

describe('hosts activation ssh intents', () => {
  it('imports from ~/.ssh/config, publishes once, notifies the Hosts tab, and returns null', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, 'Host web1\n  HostName web1.example\n');

    expect(send(f, 'import', {})).toBeNull();

    expect(f.updated).toHaveLength(1);
    expect(f.updated[0]?.value.payload).toEqual({
      filePath: file,
      rows: [row('Lab', 'lab.local'), row('web1', 'web1.example')],
    });
    expect(f.notifications).toEqual([
      { text: 'Imported 1 host from ~/.ssh/config.', options: { tab: 'hosts' } },
    ]);
    expect(f.noted).toEqual([]);
    expect(f.opened).toEqual([]);
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('exports without publishing or changing the payload, notifying the Hosts tab', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');
    const tab = f.tabPayload([row('Lab', 'lab.local')]);

    expect(send(f, 'export', {}, tab)).toBeNull();

    expect(f.updated).toEqual([]);
    expect(f.noted).toEqual([]);
    expect(f.opened).toEqual([]);
    expect(f.notifications).toEqual([
      { text: 'Exported 1 host to ~/.ssh/config.', options: { tab: 'hosts' } },
    ]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(tab).toEqual({
      filePath: path.join(f.root, '.janissary', 'hosts.json'),
      rows: [row('Lab', 'lab.local')],
    });
  });

  it('notifies a failed import and a failed export without rejecting or writing the catalog', () => {
    const imported = fixture();
    const importFile = writeCatalog(imported.root, { Lab: { destination: 'lab.local' } });
    const importBefore = readFileSync(importFile, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(send(imported, 'import', {})).toBeNull();

    expect(imported.notifications).toEqual([
      { text: 'Cannot read ssh config ~/.ssh/config: no such file.', options: { tab: 'hosts' } },
    ]);
    expect(imported.updated).toEqual([]);
    expect(readFileSync(importFile, 'utf8')).toBe(importBefore);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();

    const exported = fixture();
    writeCatalog(exported.home, '{bad json');

    expect(send(exported, 'export', {})).toBeNull();

    expect(exported.notifications.at(-1)).toEqual({
      text: `Cannot export hosts: ${path.join(exported.home, '.janissary', 'hosts.json')} is unusable — fix it by hand.`,
      options: { tab: 'hosts' },
    });
    expect(exported.updated).toEqual([]);
  });

  it('refuses a non-empty payload for either verb before reading or writing', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => send(f, 'import', { file: 'x' }))).toBe('invalid import payload');
    expect(refusal(() => send(f, 'export', { file: 'x' }))).toBe('invalid export payload');

    expect(f.notifications).toEqual([]);
    expect(f.noted).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('refuses both verbs in a remote tab in the notification feed before touching any file', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, 'Host web1\n  HostName web1.example\n');
    f.setOrigin({ label: 'hosts', cwd: f.root, root: f.root, remote: true });
    const before = readFileSync(file, 'utf8');
    vi.mocked(writeFileSync).mockClear();

    expect(send(f, 'import', {})).toBeNull();
    expect(send(f, 'export', {})).toBeNull();

    expect(f.notifications).toEqual([
      { text: 'hosts import and hosts export work only in local tabs.', options: { tab: 'hosts' } },
      { text: 'hosts import and hosts export work only in local tabs.', options: { tab: 'hosts' } },
    ]);
    expect(f.noted).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(f.opened).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('refuses both verbs with no origin tab before touching any file', () => {
    const f = fixture();
    const file = writeCatalog(f.root, { Lab: { destination: 'lab.local' } });
    writeSshConfig(f.home, 'Host web1\n  HostName web1.example\n');
    const before = readFileSync(file, 'utf8');
    f.setOrigin(null);
    vi.mocked(writeFileSync).mockClear();

    expect(refusal(() => send(f, 'import', {}))).toBe('The Hosts tab has no origin.');
    expect(refusal(() => send(f, 'export', {}))).toBe('The Hosts tab has no origin.');

    expect(f.notifications).toEqual([]);
    expect(f.noted).toEqual([]);
    expect(f.updated).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });
});
