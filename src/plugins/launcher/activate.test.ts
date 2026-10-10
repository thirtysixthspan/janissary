import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  TabPluginRejection,
  type TabActivityEntry,
  type TabPluginPayload,
  type TabPluginIntent,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import { activate } from './activate.js';
import { DEFAULT_LAUNCHER_COMMANDS } from './commands-file.js';
import { isLauncherPayload, LAUNCHER_LABEL } from './shared.js';
import { emptyTopicData } from '../topics.js';

// The rows the host hands over, in strip order. `dock` is deliberately absent on the first so the
// docked-filtering rule has something to drop and something to keep, and no row carries a `tail`,
// because the host only produces one for a caller that asks. The launcher's own row carries its plugin
// record, and the docked plugin row carries one too.
const ROWS: TabActivityEntry[] = [
  { label: 'shell', type: 'shell', group: 1, groupColor: '#5b9cff', incarnation: 'shell-incarnation', dotColor: '#5b9cff', active: true, busy: false, hasUnread: true, needsInput: false, lastActivity: 60_000, cwd: '/repo', logLength: 4, revision: 0, lastCommand: 'ls' },
  { label: 'agent', type: 'harness', group: 1, groupColor: '#5b9cff', incarnation: 'agent-incarnation', title: 'Release agent', dotColor: '#c678dd', active: false, busy: true, hasUnread: false, needsInput: true, lastActivity: 120_000, cwd: '/repo/ws', logLength: 9, revision: 0, lastCommand: 'npm test' },
  { label: 'schedules', group: 1, groupColor: '#5b9cff', incarnation: 'schedules-incarnation', view: 'plugin', plugin: { id: 'schedules', instanceKey: 'schedules' }, dock: 'left', dotColor: '#61afef', active: false, busy: false, hasUnread: false, needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 0, revision: 0 },
  { label: LAUNCHER_LABEL, group: 1, groupColor: '#5b9cff', incarnation: 'launcher-incarnation', view: 'plugin', plugin: { id: 'launcher', instanceKey: 'launcher' }, dock: 'left', dotColor: '#8b95a5', active: false, busy: false, hasUnread: false, needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 12, revision: 0 },
];

// What a tail read attaches to a row that has a transcript to slice. Distinctive so a test can prove
// it reached a prompt and never reached a payload.
const TRANSCRIPT = 'transcript output the rail must never carry';

function fixture(initialRows: TabActivityEntry[] = ROWS, root = process.cwd()) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const focused: string[] = [];
  // The instance keys this plugin has a tab open for. The host runs the creation factory only when it
  // does not: `openPluginTab` focuses the tab already holding the key and returns, which is the case a
  // second `launcher` is — and the case the configuration republish exists for.
  const openKeys = new Set<string>();
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const docks: { key: string; dock: 'left' | 'right' | null }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const notified: string[] = [];
  const dispatched: string[] = [];
  const prompted: string[] = [];
  // What each `tabActivity` read asked for. The host attaches a transcript tail only to a caller that
  // names a positive limit, which is the rule this fake reproduces rather than a convenience: the
  // summarizer reads transcripts and the display path must not.
  const activityReads: (number | undefined)[] = [];
  // The rows the host holds, mutable so a test can open or close a tab between two flushes the way the
  // application does.
  let rows = initialRows;
  // The ACP stubs, standing where the core ACP service would. `reply` is what the summarizer's prompt
  // is answered with; `startError` reproduces a session that cannot be started, which is the failure the
  // whole intent-shaped design exists to make graceful.
  let reply = '';
  let startError: string | undefined;
  // What the core answers a flush with when it refuses: core resolves a refusal with a line of prose,
  // so the summarizer is told which kind of line it got rather than left to read the text.
  let refusal: string | undefined;
  const resources = {
    registerFile: (file: string) => file,
    spawnTerminal: () => ({ ptyId: 'test-pty', cols: 80, rows: 24, running: false }),
  };
  const capabilities: TabPluginServerCapabilities = {
    startAcp: () => (startError === undefined ? { session: 'acp-test' } : { error: startError }),
    promptAcp: async () => '',
    promptAcpResult: async (prompt) => {
      prompted.push(prompt);
      return refusal === undefined
        ? { answered: true, reply, session: 'acp-test' }
        : { answered: false, error: refusal };
    },
    resetAcp: () => false,
    note: () => {},
    notifyUser: (text) => { notified.push(text); },
    openOrFocusTab: (key, factory) => {
      focused.push(key);
      if (openKeys.has(key)) return;
      openKeys.add(key);
      opened.push({ key, value: factory(resources) });
    },
    launchTab: () => {},
    updateTab: (key, factory) => { updated.push({ key, value: factory(resources) }); },
    setUnread: () => {},
    setBusy: () => {},
    dockTab: (key: string, dock: 'left' | 'right' | null) => { docks.push({ key, dock }); },
    snapshotTab: () => {},
    topicData: (topic) => emptyTopicData(topic),
    tabActivity: (tailLines?: number) => {
      activityReads.push(tailLines);
      return tailLines === undefined
        ? rows
        : rows.map((tab) => (tab.logLength === 0 ? tab : { ...tab, tail: TRANSCRIPT }));
    },
    topicAction: (action: TabPluginTopicAction) => { actions.push(action); },
    openClaimedFiles: () => {},
    projectFileList: async () => ({ root: '', paths: [] }),
    openInEditor: () => {},
    configuredViewer: () => '',
    openExternally: () => false,
    readSettings: () => ({}),
    saveSettings: () => true,
    isRecordingLive: () => false,
    originTab: () => ({ label: 'launcher', cwd: '/repo', root }),
    dispatchLineWithOutput: async (line: string) => {
      dispatched.push(line);
      return { dispatched: true, output: '' };
    },
    completeLine: () => ({ newInput: '', newCursor: 0, matches: [] }),
    terminalRunning: () => false,
    queueLine: () => {},
    nextQueuedLine: () => null,
    recordCwd: () => {},
    recordGlobalHistory: () => {},
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  };
  return {
    actions, activityReads, capabilities, dispatched, docks, notified, opened, focused, prompted, updated,
    answerWith: (text: string) => { reply = text; },
    failStartWith: (reason: string) => { startError = reason; },
    refuseWith: (reason: string | undefined) => { refusal = reason; },
    // The host closing this plugin's tab with it, so the next invocation creates one rather than
    // focusing a tab that is no longer there.
    closeLauncher: () => { openKeys.clear(); },
    closeTabs: (labels: string[]) => { rows = rows.filter((tab) => !labels.includes(tab.label)); },
    changeType: (label: string, type: string) => {
      rows = rows.map((tab) => (tab.label === label ? { ...tab, type } : tab));
    },
    growTab: (label: string, by: number) => {
      rows = rows.map((tab) => (tab.label === label ? { ...tab, logLength: tab.logLength + by } : tab));
    },
  };
}

// One summarize flush, through the activation's own intent — which is the path the launcher's client
// takes, and the path whose answering label makes the ACP capabilities resolve to the launcher's tab.
async function summarize(entry: ReturnType<typeof fixture>, activation: ReturnType<typeof activate>): Promise<void> {
  await activation.intent(
    intentRequest('summarize', {}, entry.opened[0]?.value.payload),
    entry.capabilities,
  );
}

function intentRequest(intent: string, payload: unknown, tabPayload: unknown): TabPluginIntent {
  return { tab: LAUNCHER_LABEL, intent, payload, tabPayload };
}

// The launcher is a singleton for the life of the server, so its state is module state — and every test
// that touches it has to start from that state rather than from whatever the previous test left behind.
function openLauncher(rows: TabActivityEntry[] = ROWS, root?: string): ReturnType<typeof fixture> {
  activate().dispose?.();
  const entry = root === undefined ? fixture(rows) : fixture(rows, root);
  activate().command?.('', entry.capabilities);
  entry.updated.length = 0;
  entry.prompted.length = 0;
  entry.notified.length = 0;
  return entry;
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

    expect(entry.focused).toEqual(['launcher', 'launcher']);
    // One creation, because the host focuses the tab that already holds the key rather than running
    // the factory again.
    expect(entry.opened).toHaveLength(1);
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

    const moved = ROWS.map((row) => (row.label === 'agent' ? { ...row, hasUnread: true } : row));
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

  // A streaming tab rewrites its running entry on every chunk, so its revision rises constantly. A row
  // carries no revision, so none of that reaches the fingerprint and no republish is forced by it.
  it('drops a republish whose rows differ only by a transcript revision', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    activation.notify?.({
      topic: 'tabs',
      data: ROWS.map((row) => ({ ...row, revision: row.revision + 4 })),
      tabs: ['launcher'],
    }, entry.capabilities);

    expect(entry.updated).toHaveLength(0);
  });

  // The launcher summarizing its own transcript would make every flush find content it just wrote, so a
  // prompt could never go quiet and its tail would carry its own replies. Matching on the plugin record
  // rather than the dock side means the rule holds if the launcher is ever undocked.
  it('never feeds the summarizer the launcher\'s own tab', async () => {
    // The repository's own root, which is where the shipped persona lives.
    const entry = fixture();
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.answerWith('[[tab:shell]] Running the test suite.');

    await summarize(entry, activation);

    expect(entry.notified).toEqual([]);
    // The prompt carries the other tabs, and the launcher's own transcript never enters it.
    const prompted = entry.prompted.join('\n');
    expect(prompted).toContain('[[tab:shell]]');
    expect(prompted).toContain('[[tab:agent]]');
    expect(prompted).not.toContain('[[tab:launcher]]');
  });

  // The push path: the `tabs` topic hands over every open tab, docked and undocked, and the launcher's
  // own row is one of them once it has been undocked.
  it('drops the launcher\'s own row from a topic delivery, even undocked', () => {
    const undocked = ROWS.map((row) => (row.label === LAUNCHER_LABEL
      ? { ...row, dock: undefined, label: 'launcher-2' }
      : row));
    const entry = openLauncher(undocked);
    const activation = activate();

    // The shell tab starts running something, so its row moves and there is a republish to make.
    activation.notify?.({
      topic: 'tabs',
      data: undocked.map((row) => (row.label === 'shell' ? { ...row, busy: true } : row)),
      tabs: ['launcher'],
    }, entry.capabilities);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.tabs.map((row) => row.label)).toEqual(['shell', 'agent']);
  });

  it('ignores a topic it does not declare', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    activation.notify?.(
      { topic: 'sessions', data: [], tabs: ['launcher'] },
      entry.capabilities,
    );

    expect(entry.updated).toHaveLength(0);
  });

  // The launcher names its own tabs by plugin id and instance key, because a label is the host's to
  // mint: `uniquePluginLabel` hands the launcher `launcher-2` when anything else holds `launcher`.
  it('excludes the launcher\'s own tab by ownership, so an undocked one is still excluded', () => {
    const undocked = ROWS.map((row) => (row.label === LAUNCHER_LABEL
      ? { ...row, dock: undefined, label: 'launcher-2' }
      : row));
    const entry = openLauncher(undocked);

    const payload = entry.opened[0].value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.tabs.map((row) => row.label)).toEqual(['shell', 'agent']);
  });

  // The other half of the same rule: a row that holds the label but not the ownership is somebody
  // else's tab and belongs in the rail like any other.
  it('shows a tab that merely shares the launcher\'s label', () => {
    const collided: TabActivityEntry[] = [...ROWS, {
      label: LAUNCHER_LABEL, view: 'plugin', plugin: { id: 'shell', instanceKey: 'shell-1' },
      incarnation: 'shell-plugin-incarnation', dotColor: '#98c379', active: false, busy: false, hasUnread: false,
      needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 3, revision: 0,
    }];
    const entry = openLauncher(collided);

    const payload = entry.opened[0].value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.tabs.map((row) => row.label)).toEqual(['shell', 'agent', 'launcher']);
  });

  it('keeps another plugin tab using the launcher instance key in the payload but not in summaries', async () => {
    const collision: TabActivityEntry = {
      label: 'other-launcher', view: 'plugin', plugin: { id: 'other', instanceKey: 'launcher' },
      incarnation: 'other-launcher-incarnation', dotColor: '#98c379', active: false, busy: false,
      hasUnread: false, needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 3, revision: 0,
    };
    const rows = [...ROWS.map((row) => (row.label === LAUNCHER_LABEL
      ? { ...row, dock: undefined, label: 'launcher-2' }
      : row)), collision];
    const entry = openLauncher(rows);
    const activation = activate();
    entry.answerWith('[[tab:other-launcher]] A plugin-owned tab.');

    const payload = entry.opened[0].value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.tabs.map((row) => row.label)).toContain('other-launcher');
    expect(payload.tabs.map((row) => row.label)).not.toContain('launcher-2');

    await summarize(entry, activation);

    const prompt = entry.prompted.at(-1) ?? '';
    expect(prompt).not.toContain('[[tab:other-launcher]]');
    expect(prompt).not.toContain('[[tab:launcher-2]]');
  });

  // A docked tab is never in the centre strip and never what a user is working on, so a flush does not
  // spend an ACP prompt on one.
  it('asks the summarizer for no docked tab', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the test suite.');

    await summarize(entry, activation);

    const prompt = entry.prompted.at(-1) ?? '';
    expect(prompt).toContain('[[tab:shell]]');
    expect(prompt).toContain('[[tab:agent]]');
    expect(prompt).not.toContain('[[tab:schedules]]');
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

      activation.intent(intentRequest('run-command', { id: 'tasks' }, entry.opened[0].value.payload), entry.capabilities);

      expect(entry.dispatched).toEqual(['tasks']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dispatches the Harness entry as bare `harness` to open its launch dialog', () => {
    const root = project();
    writeFileSync(
      path.join(root, '.janissary', 'launcher.json'),
      `${JSON.stringify([{ id: 'harness', icon: 'faRobot', label: 'Harness', command: 'harness' }])}\n`,
    );
    try {
      const { activation, entry } = intentFor('run-command', { id: 'harness' }, root);
      activation.command?.('', entry.capabilities);
      entry.dispatched.length = 0;

      activation.intent(
        intentRequest('run-command', { id: 'harness' }, entry.opened[0].value.payload),
        entry.capabilities,
      );

      expect(entry.dispatched).toEqual(['harness']);
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
        intentRequest('run-command', { id: 'not-a-real-entry' }, entry.opened[0].value.payload),
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

      activation.intent(intentRequest('focus-tab', { label: 'shell' }, entry.opened[0].value.payload), entry.capabilities);

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

      activation.intent(intentRequest('configure', { id: 'configure' }, entry.opened[0].value.payload), entry.capabilities);

      expect(entry.dispatched).toEqual([`edit ${path.join(root, '.janissary', 'launcher.json')}`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates the default project file before dispatching it to the editor', async () => {
    mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
    const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-no-config-'));
    const filePath = path.join(root, '.janissary', 'launcher.json');
    const entry = openLauncher(ROWS, root);
    try {
      entry.capabilities.dispatchLineWithOutput = async (line) => {
        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, 'utf8')).toBe(`${JSON.stringify(
          DEFAULT_LAUNCHER_COMMANDS.map(({ icon, label, command }) => ({ icon, label, command })), null, 2,
        )}\n`);
        entry.dispatched.push(line);
        return { dispatched: true, output: '' };
      };
      const activation = activate();

      await activation.intent(
        intentRequest('configure', { id: 'configure' }, entry.opened[0].value.payload),
        entry.capabilities,
      );

      expect(entry.dispatched).toEqual([`edit ${filePath}`]);
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
        intentRequest('dispatch', { line: 'tasks' }, entry.opened[0].value.payload),
        entry.capabilities,
      );

      expect(reply).toEqual({ dispatched: true, output: '' });
      expect(entry.dispatched).toEqual(['tasks']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Two rows naming one id were two rows that only looked different — a click on the second resolved
  // back to the first's command. Only one row survives the read, so there is nothing ambiguous to click.
  it('leaves one row to click when the file names one id twice', () => {
    const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-dup-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(
      path.join(root, '.janissary', 'launcher.json'),
      `${JSON.stringify([
        { id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' },
        { id: 'tasks', icon: 'faBell', label: 'Alerts', command: 'notifications left' },
      ], null, 2)}\n`,
    );
    try {
      const entry = fixture(ROWS, root);
      const activation = activate();
      activation.command?.('', entry.capabilities);
      entry.dispatched.length = 0;

      const payload = entry.opened[0].value.payload;
      if (!isLauncherPayload(payload)) throw new Error('payload rejected');
      expect(payload.commands.map((command) => command.command)).toEqual(['tasks']);
      expect(entry.notified.join('\n')).toContain('sharing an id another entry already holds');

      activation.intent(intentRequest('run-command', { id: 'tasks' }, payload), entry.capabilities);

      // The surviving row runs its own command.
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
        intentRequest('nope', {}, entry.opened[0].value.payload),
        entry.capabilities,
      )).toThrow('unknown launcher intent "nope"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('disposing the launcher', () => {
  it('leaves the payload state empty and the summarizer cursors behind', () => {
    const root = project();
    try {
      const entry = fixture(ROWS, root);
      const activation = activate();
      activation.command?.('', entry.capabilities);

      expect(() => activation.dispose?.()).not.toThrow();

      // The host closed this plugin's tab with it, so the next invocation creates one rather than
      // focusing a tab that is gone — and that one starts from scratch rather than resuming the old
      // state.
      entry.closeLauncher();
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

describe('summarizing', () => {
  // The wedge this whole design avoids: a `startAcp` the host refuses must be reported and retried, not
  // thrown outside the handler that already catches and never wedged.
  // `readCommands` re-reads the file on every invocation, so the server resolves a row's command
  // against the new entry. The rail has to say so too: a republish that asks only about rows drops the
  // change, and the row the user clicks no longer runs the command the row names.
  it('republishes the rail when the file behind it changed and no row moved', () => {
    const root = project();
    try {
      const entry = fixture(ROWS, root);
      const activation = activate();
      activation.command?.('', entry.capabilities);
      entry.updated.length = 0;

      writeFileSync(
        path.join(root, '.janissary', 'launcher.json'),
        `${JSON.stringify([{ id: 'tasks', icon: 'faBell', label: 'Work items', command: 'schedules' }], null, 2)}\n`,
      );
      activation.command?.('', entry.capabilities);

      const payload = entry.updated.at(-1)?.value.payload;
      if (!isLauncherPayload(payload)) throw new Error('payload rejected');
      expect(payload.commands).toEqual([
        { id: 'tasks', icon: 'faBell', label: 'Work items', command: 'schedules' },
      ]);
      // And the row the client clicks now dispatches the line the file holds.
      entry.dispatched.length = 0;
      activation.intent(intentRequest('run-command', { id: 'tasks' }, payload), entry.capabilities);
      expect(entry.dispatched).toEqual(['schedules']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The other half of the same decision: an invocation where nothing at all changed still publishes
  // nothing, so the new fingerprint cannot become a per-invocation broadcast.
  it('publishes nothing when neither the rows nor the file moved', () => {
    const entry = fixture(ROWS, project());
    const activation = activate();
    activation.command?.('', entry.capabilities);
    entry.updated.length = 0;

    activation.command?.('', entry.capabilities);

    expect(entry.updated).toHaveLength(0);
  });

  // A project that has run `janus init` has an `ai/personas/` directory and no persona in it, which
  // is every ordinary project. The read used to throw before a prompt was ever sent, so no launcher
  // outside this repository could summarise anything.
  it('reaches ACP for a project that has no persona of its own', async () => {
    const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-nopersona-'));
    mkdirSync(path.join(root, 'ai/personas'), { recursive: true });
    try {
      const entry = openLauncher(ROWS, root);
      const activation = activate();
      entry.answerWith('[[tab:shell]] Running the test suite.');

      await summarize(entry, activation);

      expect(entry.notified).toEqual([]);
      expect(entry.prompted.length).toBeGreaterThan(0);
      // The shipped persona's body is what was primed with, not a host internal's.
      expect(entry.prompted[0]).toContain('status line the launcher');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a session it cannot start, and does not wedge', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.failStartWith('ACP tab is unavailable.');

    await expect(summarize(entry, activation)).resolves.toBeUndefined();

    expect(entry.notified).toEqual(['launcher summarizer: ACP tab is unavailable.']);
    // A later flush must still get to try, which is what "not wedged" means.
    entry.failStartWith('');
    await expect(summarize(entry, activation)).resolves.toBeUndefined();
  });

  it('publishes the paragraph it was given, under its tab', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the test suite; four suites left.');

    await summarize(entry, activation);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries).toEqual({ shell: 'Running the test suite; four suites left.' });
  });

  it('summarizes only eligible tab types and removes a summary when its tab changes type', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Shell work.\n[[tab:agent]] Harness work.');
    await summarize(entry, activation);

    const initial = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(initial)) throw new Error('payload rejected');
    expect(initial.summaries).toEqual({ shell: 'Shell work.', agent: 'Harness work.' });

    entry.changeType('agent', 'editor');
    entry.updated.length = 0;
    await summarize(entry, activation);

    const updated = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(updated)) throw new Error('payload rejected');
    expect(updated.summaries).toEqual({ shell: 'Shell work.' });
  });

  it('does not feed other plugin tab types to the summarizer', async () => {
    const editor: TabActivityEntry = {
      label: 'readme', type: 'editor', view: 'editor', incarnation: 'readme-incarnation',
      dotColor: '#98c379', active: false, busy: false, hasUnread: false, needsInput: false,
      lastActivity: 0, cwd: '/repo', logLength: 1, revision: 0,
    };
    const entry = openLauncher([...ROWS, editor]);
    const activation = activate();

    await summarize(entry, activation);

    const prompt = entry.prompted.at(-1) ?? '';
    expect(prompt).toContain('[[tab:shell]]');
    expect(prompt).toContain('[[tab:agent]]');
    expect(prompt).not.toContain('[[tab:readme]]');
  });

  // A closed tab's paragraph leaves with its row, and a tab that reuses a recycled label shows nothing
  // rather than the dead tab's text.
  it('drops the paragraph of a tab that is no longer shown', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] First.');
    await summarize(entry, activation);

    // The agent tab closes, and the shell tab produces more output — so there is still a flush to make.
    entry.closeTabs(['agent']);
    entry.growTab('shell', 1);
    entry.updated.length = 0;
    entry.answerWith('[[tab:shell]] Second.');

    await summarize(entry, activation);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries).not.toHaveProperty('agent');
    expect(payload.summaries.shell).toBe('Second.');
  });

  it('primes once and prompts once per flush, asking for nothing when no tab moved', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] First.');

    await summarize(entry, activation);
    expect(entry.prompted).toHaveLength(2);

    // Nothing has moved, so the second flush asks nothing at all.
    await summarize(entry, activation);
    expect(entry.prompted).toHaveLength(2);
  });

  it('primes once across flushes when transcript changes in the same ACP session', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] First.');
    await summarize(entry, activation);

    entry.growTab('shell', 1);
    entry.answerWith('[[tab:shell]] Second.');
    await summarize(entry, activation);

    expect(entry.prompted).toHaveLength(3);
    expect(entry.prompted.filter((prompt) => prompt.includes('Answer with one block per tab'))).toHaveLength(1);
  });

  // A flush asks about the tabs that moved, so the reply normally names only those. Every other tab's
  // paragraph is one the launcher already has, and losing it would erase the recap of a tab that was
  // merely quiet until the next prompt that happened to include it.
  it('keeps the paragraph of a live tab the flush did not ask about', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the suite.\n[[tab:agent]] Waiting on the deploy.');
    await summarize(entry, activation);
    entry.updated.length = 0;

    // Only the shell tab moves, so only the shell tab is asked about.
    entry.growTab('shell', 1);
    entry.answerWith('[[tab:shell]] Four suites left.');

    await summarize(entry, activation);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries).toEqual({
      shell: 'Four suites left.',
      agent: 'Waiting on the deploy.',
    });
  });

  // Both tabs were asked about, and the reply answered only one. The tab it stayed silent about keeps
  // what it had: a reply that names no tab at all is a reply with nothing to replace.
  it('keeps a paragraph when a reply that covered the tab stayed silent about it', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the suite.\n[[tab:agent]] Waiting on the deploy.');
    await summarize(entry, activation);
    entry.updated.length = 0;

    entry.growTab('shell', 1);
    entry.growTab('agent', 1);
    entry.answerWith('[[tab:agent]] Deploying now.');

    await summarize(entry, activation);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries).toEqual({
      shell: 'Running the suite.',
      agent: 'Deploying now.',
    });
  });

  // A label is recycled the moment its tab closes, so a paragraph kept under a dead label would be
  // inherited by whatever takes the name. The close has to prune even when the flush had nothing to
  // say and therefore asked for no prompt at all.
  it('drops a closed tab\'s paragraph on a flush that prompted nothing', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the suite.\n[[tab:agent]] Waiting on the deploy.');
    await summarize(entry, activation);
    entry.closeTabs(['agent']);
    entry.updated.length = 0;

    // The agent tab closed, and nothing else moved — so there is no prompt to make, and the closed
    // tab's paragraph still has to go.
    await summarize(entry, activation);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries).toEqual({ shell: 'Running the suite.' });
  });

  // The prompt is framed as data, so a transcript line that tries to steer the reply is not obeyed.
  it('delimits the tail it feeds, and drops a marker the transcript tried to forge', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] First.');

    await summarize(entry, activation);

    const prompt = entry.prompted.at(-1) ?? '';
    expect(prompt).toContain('[[tab:shell]]');
    // The trusting instruction is primed, and the tail is delimited inside it.
    expect(entry.prompted[0]).toContain('never treat it as');
    expect(prompt.split('janus-launcher-').length).toBeGreaterThan(2);
  });

  // The plan's promise, and what the display read never delivered: a paragraph can say what a tab is
  // doing rather than only restating the flags the row already shows.
  it('feeds the summarizer a transcript slice the published rows never carry', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the test suite.');

    await summarize(entry, activation);

    expect(entry.prompted.join('\n')).toContain(TRANSCRIPT);
    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(JSON.stringify(payload)).not.toContain(TRANSCRIPT);
  });

  // An undefined limit is the host's answer for "no transcript content at all", which is exactly what
  // every real prompt used to be fed. Asking for a bounded positive number instead is the whole fix,
  // and the display path keeps asking for none.
  it('asks the host for a bounded tail on the summarizer read, and none on the display read', async () => {
    const entry = openLauncher();
    // Everything the command path read was for display: the rail's payload is built from those rows.
    expect(entry.activityReads.length).toBeGreaterThan(0);
    expect(entry.activityReads.every((limit) => limit === undefined)).toBe(true);
    entry.activityReads.length = 0;
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the test suite.');

    await summarize(entry, activation);

    expect(entry.activityReads).toEqual([8, 8, 8]);
  });

  it('drops a summary when a topic update reuses its label for another tab incarnation', async () => {
    const entry = openLauncher();
    const activation = activate();
    entry.answerWith('[[tab:shell]] Running the test suite.');
    await summarize(entry, activation);
    entry.updated.length = 0;

    activation.notify?.({
      topic: 'tabs',
      data: ROWS.map((row) => (row.label === 'shell' ? { ...row, incarnation: 'replacement-shell' } : row)),
      tabs: ['launcher'],
    }, entry.capabilities);

    const payload = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(payload)) throw new Error('payload rejected');
    expect(payload.summaries.shell).toBeUndefined();
  });

  it('prunes a __proto__ summary when that label belongs to a replacement tab', async () => {
    const rows = ROWS.map((row) => (row.label === 'shell' ? { ...row, label: '__proto__' } : row));
    const entry = openLauncher(rows);
    const activation = activate();
    entry.answerWith('[[tab:__proto__]] First tab.');
    await summarize(entry, activation);

    const first = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(first)) throw new Error('payload rejected');
    expect(Object.hasOwn(first.summaries, '__proto__')).toBe(true);
    expect(first.summaries['__proto__']).toBe('First tab.');

    activation.notify?.({
      topic: 'tabs',
      data: rows.map((row) => (row.label === '__proto__' ? { ...row, incarnation: 'replacement' } : row)),
      tabs: ['launcher'],
    }, entry.capabilities);

    const replaced = entry.updated.at(-1)?.value.payload;
    if (!isLauncherPayload(replaced)) throw new Error('payload rejected');
    expect(Object.hasOwn(replaced.summaries, '__proto__')).toBe(false);
  });
});
