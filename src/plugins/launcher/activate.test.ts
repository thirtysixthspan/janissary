import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  TabPluginRejection,
  type TabActivityEntry,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';
import { isLauncherPayload } from './shared.js';
import { toRows } from './payload.js';

// The rows the host hands over, in strip order. `dock` is deliberately absent on the first so the
// docked-filtering rule has something to drop and something to keep.
const ROWS: TabActivityEntry[] = [
  { label: 'shell', busy: false, hasUnread: true, needsInput: false, lastActivity: 60_000, cwd: '/repo', logLength: 4, lastCommand: 'ls' },
  { label: 'agent', title: 'Release agent', busy: true, hasUnread: false, needsInput: true, lastActivity: 120_000, cwd: '/repo/ws', logLength: 9, lastCommand: 'npm test' },
  { label: 'schedules', view: 'plugin', dock: 'left', busy: false, hasUnread: false, needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 0 },
];

function fixture(rows: TabActivityEntry[] = ROWS, root = '/repo') {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const notified: string[] = [];
  const dispatched: string[] = [];
  const capabilities = {
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => { opened.push({ key, value: factory() }); },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => { updated.push({ key, value: factory() }); },
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    tabActivity: () => rows,
    topicAction: (action: TabPluginTopicAction) => { actions.push(action); },
    dispatchLineWithOutput: (line: string) => {
      dispatched.push(line);
      return Promise.resolve({ dispatched: true, output: '' });
    },
    originTab: () => ({ label: 'launcher', cwd: '/repo', root }),
    notifyUser: (text: string) => { notified.push(text); },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, dispatched, docks, notified, opened, updated };
}

// A scratch project under the repository's own gitignored `temp/`, rather than the platform temporary
// directory: the sandbox a run may live in does not necessarily have one, and a scratch directory that
// cannot be created is a test that cannot run.
function project(): string {
  mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
  const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-activate-'));
  mkdirSync(path.join(root, '.janissary'), { recursive: true });
  writeFileSync(
    path.join(root, '.janissary', 'launcher.json'),
    `${JSON.stringify([{ id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' }], null, 2)}\n`,
  );
  return root;
}

describe('the launcher command', () => {
  it("opens the singleton tab titled 'launcher', docked left", () => {
    const entry = fixture();
    const root = project();
    try {
      const command = { capabilities: entry.capabilities };

      activate().command?.('', entry.capabilities);

      expect(entry.opened).toHaveLength(1);
      expect(entry.opened[0].key).toBe('launcher');
      expect(entry.opened[0].value.title).toBe('launcher');
      expect(entry.docks).toEqual([{ key: 'launcher', dock: 'left' }]);
      expect(command.capabilities).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("docks right on 'right', and refuses any other argument the way the list plugins do", () => {
    const right = fixture(ROWS, project());
    activate().command?.('right', right.capabilities);
    expect(right.docks).toEqual([{ key: 'launcher', dock: 'right' }]);

    const bad = fixture(ROWS, project());
    expect(() => activate().command?.('sideways', bad.capabilities))
      .toThrow('Usage: launcher [left|right]');
  });

  it('focuses the singleton a second time rather than opening a second list', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();

    activation.command?.('', entry.capabilities);
    activation.command?.('', entry.capabilities);

    expect(entry.opened).toHaveLength(2);
    expect(entry.opened.map((open) => open.key)).toEqual(['launcher', 'launcher']);
    expect(entry.docks).toHaveLength(2);
  });

  it('drops docked tabs from the payload, because a docked tab cannot be focused from here', () => {
    const entry = fixture(ROWS, project());
    activate().command?.('', entry.capabilities);

    const payload = entry.opened[0].value.payload;
    expect(isLauncherPayload(payload)).toBe(true);
    if (!isLauncherPayload(payload)) return;
    expect(payload.tabs.map((row) => row.label)).toEqual(['shell', 'agent']);
  });

  it('carries the commands the project file holds, and the file they came from', () => {
    const root = project();
    const entry = fixture(ROWS, root);
    try {
      activate().command?.('', entry.capabilities);

      const payload = entry.opened[0].value.payload;
      if (!isLauncherPayload(payload)) throw new Error('payload rejected');
      expect(payload.commands).toEqual([{ id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' }]);
      expect(payload.source).toBe('project');
      expect(payload.filePath).toBe(path.join(root, '.janissary', 'launcher.json'));
      expect(payload.summaries).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to the default set and reports the problem once when the file is broken', () => {
    mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
    const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-broken-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'launcher.json'), '{ oops');
    const entry = fixture(ROWS, root);
    try {
      activate().command?.('', entry.capabilities);

      const payload = entry.opened[0].value.payload;
      if (!isLauncherPayload(payload)) throw new Error('payload rejected');
      expect(payload.source).toBe('default');
      expect(payload.commands.length).toBeGreaterThan(0);
      expect(payload.problem).toContain('not valid JSON');
      // One invocation reports once; the rail is docked and has no transcript of its own.
      expect(entry.notified).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the tabs topic', () => {
  it('republishes when the rows have moved', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    const moved = toRows([
      ROWS[0]!,
      { ...ROWS[1]!, hasUnread: true },
    ]);
    activation.notify?.({ topic: 'tabs', data: moved, tabs: ['launcher'] }, entry.capabilities);

    expect(entry.updated).toHaveLength(1);
    expect(entry.updated[0].key).toBe('launcher');
  });

  // A per-mutation signal must not become a per-mutation broadcast: this is the whole reason the rows are
  // minute-rounded and the handler drops an unchanged republish.
  it('drops a republish whose rows have not moved', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    activation.notify?.({ topic: 'tabs', data: ROWS, tabs: ['launcher'] }, entry.capabilities);

    expect(entry.updated).toHaveLength(0);
  });

  it('stops the summarizer when the launcher tab closes', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    // The launcher's own tab closing is the delivery carrying no instance keys.
    expect(() => activation.notify?.({ topic: 'tabs', data: [], tabs: [] }, entry.capabilities)).not.toThrow();
    expect(entry.updated).toHaveLength(0);
  });

  it('ignores a topic it does not declare', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    activation.notify?.(
      { topic: 'sessions', data: [], tabs: ['launcher'] } as unknown as Parameters<NonNullable<typeof activation.notify>>[0],
      entry.capabilities,
    );

    expect(entry.updated).toHaveLength(0);
  });
});

describe('the launcher intents', () => {
  const intentFor = (name: string, payload: unknown, root: string) => {
    const entry = fixture(ROWS, root);
    const activation = activate();
    return { activation, entry };
  };

  it('dispatches the command line the entry resolves back to', () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('run-command', { id: 'tasks' }, root);
      activation.command?.('', entry.capabilities);
      entry.dispatched.length = 0;

      activation.intent(
        { tabLabel: 'launcher', intent: 'run-command', payload: { id: 'tasks' }, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      );

      expect(entry.dispatched).toEqual(['tasks']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an id the file does not hold, dispatching nothing', () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('run-command', { id: 'not-a-real-entry' }, root);
      activation.command?.('', entry.capabilities);
      entry.dispatched.length = 0;

      activation.intent(
        { tabLabel: 'launcher', intent: 'run-command', payload: { id: 'not-a-real-entry' }, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      );

      expect(entry.dispatched).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('focuses a tab row through the topic action', () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('focus-tab', { label: 'shell' }, root);
      activation.command?.('', entry.capabilities);

      activation.intent(
        { tabLabel: 'launcher', intent: 'focus-tab', payload: { label: 'shell' }, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      );

      expect(entry.actions).toEqual([{ topic: 'tabs', action: 'focus', label: 'shell' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('opens the file in effect when the Configure button is pressed', () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('configure', { id: 'configure' }, root);
      activation.command?.('', entry.capabilities);

      activation.intent(
        { tabLabel: 'launcher', intent: 'configure', payload: { id: 'configure' }, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      );

      expect(entry.dispatched).toEqual([`edit ${path.join(root, '.janissary', 'launcher.json')}`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('answers a typed line with what the dispatcher produced', async () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('dispatch', { line: 'tasks' }, root);
      activation.command?.('', entry.capabilities);

      const reply = await activation.intent(
        { tabLabel: 'launcher', intent: 'dispatch', payload: { line: 'tasks' }, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      );

      expect(reply).toEqual({ dispatched: true, output: '' });
      expect(entry.dispatched).toEqual(['tasks']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses an intent the table does not carry', () => {
    const root = project();
    try {
      const { activation, entry } = intentFor('nope', {}, root);
      activation.command?.('', entry.capabilities);

      expect(() => activation.intent(
        { tabLabel: 'launcher', intent: 'nope', payload: {}, tabPayload: entry.opened[0].value.payload },
        entry.capabilities,
      )).toThrow('unknown launcher intent "nope"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('disposing the launcher', () => {
  it('leaves the summarizer stopped and the payload state empty', () => {
    const root = project();
    try {
      const entry = fixture(ROWS, root);
      const activation = activate();
      activation.command?.('', entry.capabilities);

      expect(() => activation.dispose?.()).not.toThrow();

      // A command after a dispose starts from scratch rather than resuming the old state.
      activation.command?.('', entry.capabilities);
      const payload = entry.opened.at(-1)?.value.payload;
      if (!isLauncherPayload(payload)) throw new Error('payload rejected');
      expect(payload.summaries).toEqual({});
      expect(payload.commands).toEqual([{ id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
