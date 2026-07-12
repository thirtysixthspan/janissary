import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Controller } from './controller.js';
import { initAgentStateDirectory, saveAgentState, loadAgentState } from './agent-state.js';
import { initGlobalHistory, globalCommands } from './global-history.js';
import { initProfileDir } from './profiles.js';
import { messageBus } from './bus.js';
import { TranscriptLogger } from './transcript/logger.js';
import { abbreviatePath } from './paths.js';
import { initDbDir, isConnectionOpen, closeAllConnections } from './connections.js';
import { loadConfig } from './config.js';
import { openNotificationsTab } from './notifications-tab.js';
import { agentNames } from './commands.js';
import { spawnPty } from './pty.js';
import type { PtyHandlers } from './pty.js';
import type { BusEvent } from './bus.js';

// The external-open path shells out to the OS image viewer; stub it so tests never launch an app.
vi.mock('./openers/os-open.js', () => ({ didOsOpen: () => true }));
// Mock spawnPty so harness tests never spawn real processes.
vi.mock('./pty.js');

// Sinks that just count state emissions; no PTY/shell spawning is exercised here.
const makeController = () => {
  let states = 0;
  const c = new Controller({ emitState: () => { states++; }, sendPty: () => {}, sendPtyExit: () => {} });
  return { c, get states() { return states; } };
};

const allText = (c: Controller) => c.view().flatMap((t) => t.bufferLines).map((l) => l.text).join('\n');

describe('Controller rootDir', () => {
  it('returns the constructor-supplied projectDir', () => {
    const c = new Controller({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }, '/some/project');
    expect(c.rootDir).toBe('/some/project');
  });

  it('falls back to process.cwd() when projectDir is omitted', () => {
    const c = new Controller({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
    expect(c.rootDir).toBe(process.cwd());
  });
});

describe('Controller', () => {
  it('starts with a single janus tab', () => {
    const { c } = makeController();
    expect(c.view()).toHaveLength(1);
    expect(c.view()[0].label).toBe('janus');
  });

  it('routes a built-in with output into the transcript', () => {
    const { c } = makeController();
    c.dispatch('help');
    expect(c.view()[0].bufferLines.some((l) => l.type === 'markdown')).toBe(true);
  });

  it('clears the transcript with clear', () => {
    const { c } = makeController();
    c.dispatch('help');
    c.dispatch('clear');
    expect(c.view()[0].bufferLines).toHaveLength(0);
  });

  it('creates a named agent tab and switches focus to it', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    expect(c.view().map((t) => t.label)).toContain('bob');
    // Focus switches to the new agent tab.
    expect(c.view()[c.managers.tab.activeTab].label).toBe('bob');
  });

  it('draws a random pool name for a bare agent command', () => {
    const { c } = makeController();
    c.dispatch('agent');
    const created = c.view().map((t) => t.label).filter((l) => l !== 'janus');
    expect(created).toHaveLength(1);
    expect(agentNames).toContain(created[0]);
  });

  it('reports when an agent name is already active', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.dispatch('agent bob');
    expect(allText(c)).toContain('already active');
    expect(c.view().filter((t) => t.label === 'bob')).toHaveLength(1);
  });

  it('a child agent inherits the creator group and bar color', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    const janus = c.view().find((t) => t.label === 'janus')!;
    const bob = c.view().find((t) => t.label === 'bob')!;
    expect(bob.group).toBe(janus.group);
    expect(bob.groupColor).toBe(janus.groupColor);
  });

  it('a launched profile forms its own group, distinct from the root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-prof-'));
    initProfileDir(root); // profiles live under <root>/profiles/<name>
    mkdirSync(path.join(root, 'profiles', 'writing'), { recursive: true });
    writeFileSync(path.join(root, 'profiles', 'writing', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false }));
    const { c } = makeController();
    c.dispatch('profile launch writing');
    const janus = c.view().find((t) => t.label === 'janus')!;
    const writer = c.view().find((t) => t.label === 'writer')!;
    expect(writer).toBeDefined();
    expect(writer.group).not.toBe(janus.group);
  });

  it('honors a group number authored on a profile agent file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-prof-grp-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles', 'team'), { recursive: true });
    writeFileSync(path.join(root, 'profiles', 'team', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false, group: 7 }));
    const { c } = makeController();
    c.dispatch('profile launch team');
    expect(c.view().find((t) => t.label === 'writer')!.group).toBe(7);
  });

  it('caps a tab transcript at transcriptMaxLines, dropping the oldest entries', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-cap-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'config.json'), JSON.stringify({ transcriptMaxLines: 3 }));
    try {
      loadConfig(root);
      const { c } = makeController();
      // Each `agent <name>` is dispatched from janus so the transcript entry goes to janus.
      for (let index = 0; index < 6; index++) { c.dispatch(`agent foo${index}`); c.setActiveTab(0); }
      const janus = c.view().find((t) => t.label === 'janus')!;
      const buffer = janus.bufferLines.map((l) => l.text).join('\n');
      expect(buffer).not.toContain('foo0'); // oldest entries dropped beyond the 3-entry cap
      expect(buffer).not.toContain('foo2');
      expect(buffer).toContain('foo3');
      expect(buffer).toContain('foo5');
    } finally {
      loadConfig(mkdtempSync(path.join(tmpdir(), 'janus-cap-reset-'))); // restore the default cap for later tests
    }
  });

  it('attributes a SQLite connection only to the tab that opened it', () => {
    initDbDir(mkdtempSync(path.join(tmpdir(), 'janus-db-')));
    const { c } = makeController();
    c.dispatch('agent bob'); // focus moves to bob
    c.setActiveTab(0);
    c.dispatch('db sqlite create panel_db'); // runs on the active tab (janus)
    try {
      const janus = c.view().find((t) => t.label === 'janus')!;
      const bob = c.view().find((t) => t.label === 'bob')!;
      expect(janus.connections.some((x) => x.text === 'sqlite:panel_db')).toBe(true);
      expect(bob.connections.some((x) => x.text === 'sqlite:panel_db')).toBe(false);
    } finally {
      closeAllConnections();
    }
  });

  it('auto-runs a bare SQL command as a db query when exactly one database is open', () => {
    initDbDir(mkdtempSync(path.join(tmpdir(), 'janus-route-')));
    const { c } = makeController();
    c.dispatch('db sqlite create routedb');
    try {
      c.dispatch('select 1 as n'); // recognized as a db query; one db open → runs against it
      const text = allText(c);
      expect(text).toContain('(1 row)');
      expect(text).not.toContain('Unrecognized command');
    } finally {
      closeAllConnections();
    }
  });

  it('opens a route chooser for an ambiguous command and cancels without running', () => {
    const { c } = makeController();
    const before = c.view()[0].bufferLines.length;
    c.dispatch('select 1 as n'); // SQL-shaped but no db open → ambiguous
    const rv = c.routeView();
    expect(rv).not.toBeNull();
    expect(rv!.cmd).toBe('select 1 as n');
    expect(rv!.choices).toEqual(['shell', 'acp (agent prompt)']);
    c.chooseRoute(-1); // cancel
    expect(c.routeView()).toBeNull();
    expect(c.view()[0].bufferLines.length).toBe(before); // nothing was run or appended
  });

  it('runs the chosen db route from the chooser when multiple databases are open', () => {
    initDbDir(mkdtempSync(path.join(tmpdir(), 'janus-chooser-db-')));
    const { c } = makeController();
    c.dispatch('db sqlite create d1');
    c.dispatch('db sqlite create d2'); // two open dbs → a db query needs the user to pick one
    try {
      c.dispatch('select 1 as n');
      const rv = c.routeView();
      expect(rv).not.toBeNull();
      const index = rv!.choices.findIndex((l) => l.includes('d1'));
      expect(index).toBeGreaterThan(-1);
      c.chooseRoute(index);
      expect(c.routeView()).toBeNull();
      expect(allText(c)).toContain('(1 row)'); // ran the query against d1
    } finally {
      closeAllConnections();
    }
  });

  it('closes all SQLite connections when the last tab is closed', () => {
    initDbDir(mkdtempSync(path.join(tmpdir(), 'janus-db2-')));
    const { c } = makeController();
    c.dispatch('db sqlite create lastdb');
    expect(isConnectionOpen('lastdb')).toBe(true);
    c.dispatch('close'); // last tab → closeAllConnections, then app exit
    expect(isConnectionOpen('lastdb')).toBe(false);
  });

  it('shutdown closes all SQLite connections (quit)', () => {
    initDbDir(mkdtempSync(path.join(tmpdir(), 'janus-db3-')));
    const { c } = makeController();
    c.dispatch('db sqlite create shutdb');
    expect(isConnectionOpen('shutdb')).toBe(true);
    c.shutdown();
    expect(isConnectionOpen('shutdb')).toBe(false);
  });

  it('records an info message in the recipient context[] and persists it', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-ctx-')));
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.dispatch('msg bob info hello there');
    expect(loadAgentState('bob')?.context).toContain('janus: hello there');
  });

  it('preserves saved (non-contiguous) tab numbers on relaunch', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-relaunch-')));
    saveAgentState({ name: 'ahmed', dotColor: '#5b9cff', active: false, number: 1 });
    saveAgentState({ name: 'bekir', dotColor: '#6bcb77', active: false, number: 3 });
    saveAgentState({ name: 'cafer', dotColor: '#ff6b6b', active: false, number: 5 });
    const { c } = makeController();
    c.rehydrate();
    const byLabel = Object.fromEntries(c.view().map((t) => [t.label, t.number]));
    expect(byLabel).toEqual({ ahmed: 1, bekir: 3, cafer: 5 });
  });

  it('rename sets a display alias without changing the label', () => {
    const { c } = makeController();
    c.dispatch('rename reviewer');
    expect(c.view()[0].label).toBe('janus');
    expect(c.view()[0].title).toBe('reviewer');
  });

  it('bare rename clears the alias', () => {
    const { c } = makeController();
    c.dispatch('rename reviewer');
    c.dispatch('rename');
    expect(c.view()[0].title).toBeUndefined();
  });

  it('truncates a rename to the configured tab name max length', () => {
    const { c } = makeController();
    c.dispatch('rename abcdefghijklmnopqrstuvwxyz');
    expect(c.view()[0].title).toBe('abcdefghijklmnop'); // 16 chars, the default tabNameMaxLength
  });

  it('persists and restores the alias across rehydrate', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-alias-')));
    const { c } = makeController();
    c.dispatch('rename reviewer');
    const c2 = makeController().c;
    c2.rehydrate();
    expect(c2.view().find((t) => t.label === 'janus')?.title).toBe('reviewer');
  });

  it('records a fired scheduled command in the tab history (as if typed there)', () => {
    vi.useFakeTimers();
    try {
      initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-sched-')));
      const { c } = makeController(); // starts the 1s scheduler interval (fake)
      c.dispatch('schedule t1 every 1m clear'); // recurring; first run ~60s out, no shell spawn
      vi.advanceTimersByTime(61_000); // let the scheduler tick fire it
      expect(c.view().find((t) => t.label === 'janus')!.cmdHistory).toContain('clear');
    } finally {
      vi.useRealTimers();
    }
  });

  it('quit asks the host to exit', () => {
    let isExited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { isExited = true; } });
    c.dispatch('quit');
    expect(isExited).toBe(true);
  });

  it('exit is an alias of close — with other tabs open it closes the tab, not the host', () => {
    let isExited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { isExited = true; } });
    c.dispatch('agent bob');
    c.setActiveTab(1);
    c.dispatch('exit');
    expect(isExited).toBe(false);
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('close removes the active tab and its connections', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(1);
    c.dispatch('close');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('closing the last tab quits the app', () => {
    let isExited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { isExited = true; } });
    c.dispatch('close'); // only tab open -> behaves like quit
    expect(isExited).toBe(true);
  });

  it('closing the last non-docked tab quits the app even with a docked file navigator', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-last-tab-'));
    let isExited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { isExited = true; } });
    c.dispatch(`files left ${root}`);
    c.dispatch('close'); // close the active (janus) tab — only non-docked tab
    expect(isExited).toBe(true);
  });

  it('records transcript content in the append-only log', () => {
    const tl = new TranscriptLogger(mkdtempSync(path.join(tmpdir(), 'janus-log-')));
    try {
      const { c } = makeController();
      c.dispatch('help');
      const files = readdirSync(TranscriptLogger.logDir).filter((f) => f.endsWith('.json'));
      expect(files.length).toBe(1);
      const entries = readFileSync(path.join(TranscriptLogger.logDir, files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      // The command input and its output are logged as separate entries, each timestamped HH:MM:SS.mmm.
      expect(entries.some((entry) => entry.agent === 'janus' && entry.text === 'help')).toBe(true);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.every((entry) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(entry.timestamp))).toBe(true);
    } finally {
      tl.unsubscribe();
    }
  });

  it('reports an unknown harness without launching a PTY', () => {
    const { c } = makeController();
    c.dispatch('harness gemini');
    expect(allText(c)).toContain('Unknown harness');
  });

  it('treats a non-interactive hist as a no-op (the picker is client-side)', () => {
    const { c } = makeController();
    c.dispatch('hist');
    expect(allText(c)).toBe('');
  });

  it('tab-completes a msg recipient against agent names', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    const res = c.complete('msg b', 5);
    expect(res.newInput).toBe('msg bob ');
    expect(res.matches).toEqual(['bob']);
  });

  it('tab-completes a filesystem path for shell commands', () => {
    const { c } = makeController(); // cwd is the repo root, which has README.md
    const res = c.complete('shell READ', 10);
    expect(res.newInput).toBe('shell README.md ');
  });

  it('cycles and toggles via UI shortcuts', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    expect(c.managers.tab.activeTab).toBe(0);
    c.moveTab(1);
    expect(c.managers.tab.activeTab).toBe(1);
    c.toggleCollapse();
    expect(c.view()[1].toolStepsExpanded).toBe(true);
  });

  it('reorders the active tab within its group, renumbering and following the move', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.dispatch('agent carol'); // all three share group 1; order: janus, bob, carol
    c.setActiveTab(2); // carol
    c.reorderTab(-1);
    expect(c.view().map((t) => t.label)).toEqual(['janus', 'carol', 'bob']);
    expect(c.view()[c.managers.tab.activeTab].label).toBe('carol'); // focus follows the moved tab
    expect(c.view().map((t) => t.number)).toEqual([1, 2, 3]); // renumbered by position
  });

  it('is a no-op when reordering past the strip edge', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.reorderTab(-1); // janus is already leftmost
    expect(c.view().map((t) => t.label)).toEqual(['janus', 'bob']);
    expect(c.managers.tab.activeTab).toBe(0);
  });

  it('will not reorder a tab across a group boundary', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-reorder-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles', 'writing'), { recursive: true });
    writeFileSync(path.join(root, 'profiles', 'writing', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false }));
    const { c } = makeController();
    c.dispatch('profile launch writing'); // [janus(g1), writer(g2)], active = writer (index 1)
    c.reorderTab(-1); // would cross from group 2 into group 1 — blocked
    expect(c.view().map((t) => t.label)).toEqual(['janus', 'writer']);
  });

  it('adds, lists, and clears scheduled commands', () => {
    const { c } = makeController();
    c.dispatch('schedule nightly every 1h echo hi');
    expect(allText(c)).toContain('Scheduled nightly');
    c.dispatch('schedule list');
    expect(allText(c)).toContain('nightly');
    c.dispatch('schedule clear');
    expect(allText(c)).toContain('Cleared 1 scheduled command');
  });

  it('exposes schedule rows (and a connections array) in the tab view', () => {
    const { c } = makeController();
    c.dispatch('schedule nightly every 1h echo hi');
    const v = c.view()[c.managers.tab.activeTab];
    expect(v.schedule.map((s) => s.id)).toContain('nightly');
    expect(v.schedule[0].next).toBeTruthy();
    expect(Array.isArray(v.connections)).toBe(true);
  });

  it('delivers an info message to another agent', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.dispatch('msg bob info hello there');
    const bob = c.view().find((t) => t.label === 'bob')!;
    const messageLine = bob.bufferLines.find((l) => l.type === 'message' && l.from === 'janus');
    expect(messageLine?.text).toContain('hello there');
  });

  it('delivers a message to an agent addressed by its display alias', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(c.view().findIndex((t) => t.label === 'bob'));
    c.dispatch('rename buddy'); // bob now displays as "buddy"
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus'));
    c.dispatch('msg buddy info hello there');
    const bob = c.view().find((t) => t.label === 'bob')!;
    const messageLine = bob.bufferLines.find((l) => l.type === 'message' && l.from === 'janus');
    expect(messageLine?.text).toContain('hello there');
  });

  it('broadcasts info to all other agents', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.dispatch('agent carol');
    c.setActiveTab(0);
    c.dispatch('broadcast all info ping');
    for (const label of ['bob', 'carol']) {
      const tab = c.view().find((t) => t.label === label)!;
      expect(tab.bufferLines.some((l) => l.type === 'message' && l.text.includes('ping'))).toBe(true);
    }
  });

  it('lists connections (none open) and profiles (none)', () => {
    initProfileDir(mkdtempSync(path.join(tmpdir(), 'janus-noprof-'))); // isolate from other tests' profiles
    const { c } = makeController();
    c.dispatch('connection list');
    expect(allText(c)).toContain('No open connections.');
    c.dispatch('profile list');
    expect(allText(c)).toContain('No profiles.');
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('handles browser commands without launching a browser', async () => {
    const { c } = makeController();
    c.dispatch('browser list'); // no browser launched -> "No browser windows."
    await flush();
    expect(allText(c)).toContain('No browser windows.');
  });

  it('reports usage for a malformed browser command (not the unported notice)', async () => {
    const { c } = makeController();
    c.dispatch('browser bogus');
    await flush();
    const text = allText(c);
    expect(text).toContain('Usage: browser');
    expect(text).not.toContain('not yet available');
  });

  it('routes acp to its handler (usage on empty prompt, not the unported notice)', () => {
    const { c } = makeController();
    c.dispatch('acp');
    const text = allText(c);
    expect(text).toContain('Usage: acp');
    expect(text).not.toContain('not yet available');
  });

  it('acp reset reports no session when none is active', () => {
    const { c } = makeController();
    c.dispatch('acp reset');
    expect(allText(c)).toContain('No active ACP session to reset');
  });

  it('shows persisted state with the state command', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-state-')));
    const { c } = makeController();
    c.dispatch('help'); // triggers a persist of the janus tab
    c.dispatch('state');
    expect(allText(c)).toContain('name:');
  });
});

describe('Controller open command', () => {
  // Write a throwaway image file and return its absolute path.
  const temporaryImage = (name = 'pic.png') => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-open-')), name);
    writeFileSync(file, Buffer.alloc(10));
    return file;
  };

  it('open <image> creates a focused image tab titled "image"', () => {
    const file = temporaryImage();
    const { c } = makeController();
    c.dispatch(`open ${file}`);
    expect(c.view()).toHaveLength(2);
    const img = c.view()[1];
    expect(img.view).toBe('image');
    expect(img.title).toBe('pic.png');
    expect(img.image?.name).toBe('pic.png');
    expect(img.image?.path).toBe(file);
    expect(c.managers.tab.activeTab).toBe(1); // focus moves to the new image tab
  });

  it('gives each image tab a unique internal label while using the filename as display title', () => {
    const { c } = makeController();
    c.dispatch(`open ${temporaryImage('a.png')}`);
    c.dispatch(`open ${temporaryImage('b.png')}`);
    const imgs = c.view().filter((t) => t.view === 'image');
    expect(imgs).toHaveLength(2);
    expect(new Set(imgs.map((t) => t.label)).size).toBe(2); // distinct labels
    expect(imgs.map((t) => t.title)).toEqual(['a.png', 'b.png']); // filenames as display names
  });

  it('does not persist an image tab to agent state', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-open-state-')));
    const { c } = makeController();
    c.dispatch(`open ${temporaryImage()}`);
    expect(loadAgentState('image')).toBeFalsy();
  });

  it('open external <image> confirms without creating a tab', () => {
    const { c } = makeController();
    c.dispatch(`open external ${temporaryImage()}`);
    expect(c.view()).toHaveLength(1);
    expect(allText(c)).toContain('Opening pic.png');
  });

  it('reports no opener for an unsupported file type', () => {
    const file = temporaryImage('notes.xyz');
    const { c } = makeController();
    c.dispatch(`open ${file}`);
    expect(allText(c)).toContain('No opener for ".xyz" files');
    expect(c.view()).toHaveLength(1);
  });

  it('reports a missing file before dispatching to an opener', () => {
    const { c } = makeController();
    c.dispatch('open /no/such/pic.png');
    expect(allText(c)).toContain('no such file');
    expect(c.view()).toHaveLength(1);
  });

  it('closeTab removes an image tab and unregisters its served file', () => {
    const { c } = makeController();
    c.dispatch(`open ${temporaryImage()}`);
    const id = c.view()[1].image!.url.replace('/open/', '');
    expect(c.openFilePath(id)).toBeTruthy();
    c.closeTab(1);
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
    expect(c.openFilePath(id)).toBeUndefined();
  });

  // Create a temp directory with the given files and return its absolute path.
  const tmpDirWith = (names: string[]) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-glob-'));
    for (const n of names) writeFileSync(path.join(dir, n), Buffer.alloc(5));
    return dir;
  };

  it('open <glob> expands via the shell and opens a tab per matching file', () => {
    const dir = tmpDirWith(['a.png', 'b.png', 'c.png', 'notes.txt']);
    const { c } = makeController();
    c.dispatch(`open ${dir}/*.png`);
    const imgs = c.view().filter((t) => t.view === 'image');
    expect(imgs).toHaveLength(3); // the .txt is not matched by *.png
    expect(imgs.map((t) => t.image!.name).toSorted((a, b) => a.localeCompare(b))).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('caps a wildcard open at 10 files and notes the overflow', () => {
    const dir = tmpDirWith(Array.from({ length: 15 }, (_, index) => `f${index}.png`));
    const { c } = makeController();
    c.dispatch(`open ${dir}/*.png`);
    expect(c.view().filter((t) => t.view === 'image')).toHaveLength(10);
    expect(allText(c)).toContain('first 10 of 15 matching files');
  });

  it('reports when a wildcard matches nothing', () => {
    const dir = tmpDirWith([]);
    const { c } = makeController();
    c.dispatch(`open ${dir}/*.png`);
    expect(c.view().filter((t) => t.view === 'image')).toHaveLength(0);
    expect(allText(c)).toContain('no matching files');
  });
});

describe('Controller page tabs', () => {
  it('open https URL creates a page tab with view:page and correct title', () => {
    const { c } = makeController();
    c.dispatch('open https://slashdot.org');
    const pages = c.view().filter((t) => t.view === 'page');
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('slashdot.org');
    expect(pages[0].page?.url).toContain('slashdot.org');
  });

  it('open page <domain> creates a page tab (page keyword + bare domain)', () => {
    const { c } = makeController();
    c.dispatch('open page slashdot.org');
    const pages = c.view().filter((t) => t.view === 'page');
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('slashdot.org');
  });

  it('second page tab gets number 2', () => {
    const { c } = makeController();
    c.dispatch('open https://slashdot.org');
    c.dispatch('open https://example.com');
    const pages = c.view().filter((t) => t.view === 'page');
    expect(pages).toHaveLength(2);
    const titles = pages.map((t) => t.title).toSorted((a, b) => String(a).localeCompare(String(b)));
    expect(titles).toEqual(['example.com', 'slashdot.org']);
  });

  it('open external https URL confirms in transcript without creating a tab', () => {
    const { c } = makeController();
    c.dispatch('open external https://x.com');
    expect(c.view()).toHaveLength(1);
    expect(allText(c)).toMatch(/x\.com/);
  });

  it('close page <n> closes the numbered page tab', () => {
    const { c } = makeController();
    c.dispatch('open https://slashdot.org');
    expect(c.view().filter((t) => t.view === 'page')).toHaveLength(1);
    c.dispatch('close page 1');
    expect(c.view().filter((t) => t.view === 'page')).toHaveLength(0);
  });

  it('close page <n> reports an error for an unknown page number', () => {
    const { c } = makeController();
    c.dispatch('close page 99');
    expect(allText(c)).toContain('No page numbered 99');
  });

  it('close <tabname> closes the named tab', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    expect(c.view().map((t) => t.label)).toContain('bob');
    c.dispatch('close bob');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('exit <tabname> closes the named tab (alias)', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.dispatch('exit bob');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('close <tabname> reports an error for an unknown tab name', () => {
    const { c } = makeController();
    c.dispatch('close nobody');
    expect(allText(c)).toContain('No tab named "nobody".');
  });

  it('close <tabname> is case-insensitive', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.dispatch('close BOB');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('page numbers are reused after close', () => {
    const { c } = makeController();
    c.dispatch('open https://slashdot.org');
    c.dispatch('close page 1');
    c.dispatch('open https://example.com');
    const pages = c.view().filter((t) => t.view === 'page');
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('example.com');
  });

  it('open page with an invalid scheme reports an error', () => {
    const { c } = makeController();
    c.dispatch('open page javascript:alert(1)');
    expect(c.view().filter((t) => t.view === 'page')).toHaveLength(0);
    expect(allText(c)).toContain('invalid URL');
  });
});

describe('Controller harness view', () => {
  let capturedHandlers: PtyHandlers | null;
  let capturedKill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedHandlers = null;
    capturedKill = vi.fn();
    vi.mocked(spawnPty).mockClear();
    vi.mocked(spawnPty).mockImplementation((program, _command, _cwd, handlers) => {
      capturedHandlers = handlers;
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: capturedKill };
    });
  });

  it('harness claude opens a harness view tab with view, title, status, and ptyId', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const tab = c.view().find((t) => t.label === 'claude');
    expect(tab).toBeDefined();
    expect(tab!.view).toBe('harness');
    expect(tab!.title).toBe('claude');
    expect(tab!.harness?.status).toBe('running');
    expect(tab!.harness?.ptyId).toBe('mock-pty-1');
  });

  it('focuses the new harness tab', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    expect(c.view()[c.managers.tab.activeTab].label).toBe('claude');
  });

  it('harness opencode as quality opens a tab labeled quality running opencode', () => {
    const { c } = makeController();
    c.dispatch('harness opencode as quality');
    const tab = c.view().find((t) => t.label === 'quality');
    expect(tab).toBeDefined();
    expect(tab!.title).toBe('quality');
    expect(tab!.harness?.name).toBe('opencode');
  });

  it('a second harness claude gets a unique label', () => {
    vi.mocked(spawnPty)
      .mockImplementationOnce((program, _cmd, _cwd, handlers) => {
        capturedHandlers = handlers;
        return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
      })
      .mockImplementationOnce((program, _cmd, _cwd, _handlers) => {
        return { id: 'mock-pty-2', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
      });
    const { c } = makeController();
    c.dispatch('harness claude');
    c.dispatch('harness claude');
    const labels = c.view().map((t) => t.label);
    expect(labels).toContain('claude');
    expect(labels).toContain('claude-2');
  });

  it('PTY exit closes the harness tab', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    expect(capturedHandlers).not.toBeNull();
    capturedHandlers!.onExit('mock-pty-1', 0);
    expect(c.view().map((t) => t.label)).not.toContain('claude');
  });

  it('closing a harness tab kills its PTY', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const index = c.view().findIndex((t) => t.label === 'claude');
    c.closeTab(index);
    expect(capturedKill).toHaveBeenCalled();
    expect(c.view().map((t) => t.label)).not.toContain('claude');
  });

  it('harness claude opens with the tab marked busy', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const tab = c.view().find((t) => t.label === 'claude');
    expect(tab!.busy).toBe(true);
  });

  it('closing a harness tab clears its busy flag', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const index = c.view().findIndex((t) => t.label === 'claude');
    c.closeTab(index);
    expect(c.managers.tab.isBusy('claude')).toBe(false);
  });

  it('unknown harness name produces an error in the transcript (not a tab)', () => {
    const { c } = makeController();
    c.dispatch('harness gemini');
    expect(allText(c)).toContain('Unknown harness');
    expect(c.view().map((t) => t.label)).not.toContain('gemini');
    expect(vi.mocked(spawnPty)).not.toHaveBeenCalled();
  });

  it('harness tab appears in the connections panel as terminal:<name>', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const tab = c.view().find((t) => t.label === 'claude');
    expect(tab!.connections.some((r) => r.kind === 'terminal' && r.text.includes('claude'))).toBe(true);
  });

  it('records the harness command in the creator\'s transcript before the PTY spawns', () => {
    const { c } = makeController();
    vi.mocked(spawnPty).mockImplementationOnce((program, _command, _cwd, handlers) => {
      expect(allText(c)).toContain('harness claude');
      capturedHandlers = handlers;
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    c.dispatch('harness claude');
    expect(allText(c)).toContain('harness claude');
  });
});

describe('Controller ssh tab', () => {
  let capturedHandlers: PtyHandlers | null;
  let capturedKill: ReturnType<typeof vi.fn>;
  let capturedCommand = '';

  beforeEach(() => {
    capturedHandlers = null;
    capturedKill = vi.fn();
    capturedCommand = '';
    vi.mocked(spawnPty).mockClear();
    vi.mocked(spawnPty).mockImplementation((program, command, _cwd, handlers) => {
      capturedHandlers = handlers;
      capturedCommand = command;
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: capturedKill };
    });
  });

  it('ssh devbox opens a harness-view tab labeled devbox, running the verbatim command', () => {
    const { c } = makeController();
    c.dispatch('ssh devbox');
    const tab = c.view().find((t) => t.label === 'devbox');
    expect(tab).toBeDefined();
    expect(tab!.view).toBe('harness');
    expect(tab!.harness?.name).toBe('ssh');
    expect(tab!.harness?.destination).toBe('devbox');
    expect(capturedCommand).toBe('ssh devbox');
    expect(c.view()[c.managers.tab.activeTab].label).toBe('devbox');
  });

  it('view() for the ssh tab lists ssh:<destination> in connections and no terminal: row', () => {
    const { c } = makeController();
    c.dispatch('ssh devbox');
    const tab = c.view().find((t) => t.label === 'devbox')!;
    expect(tab.connections).toContainEqual({ text: 'ssh:devbox', kind: 'ssh' });
    expect(tab.connections.some((r) => r.kind === 'terminal')).toBe(false);
  });

  it('a second ssh devbox gets a unique label', () => {
    vi.mocked(spawnPty)
      .mockImplementationOnce((program, _command, _cwd, handlers) => {
        capturedHandlers = handlers;
        return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
      })
      .mockImplementationOnce((program, _command, _cwd, _handlers) => {
        return { id: 'mock-pty-2', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
      });
    const { c } = makeController();
    c.dispatch('ssh devbox');
    c.dispatch('ssh devbox');
    const labels = c.view().map((t) => t.label);
    expect(labels).toContain('devbox');
    expect(labels).toContain('devbox-2');
  });

  it('PTY exit closes the ssh tab', () => {
    const { c } = makeController();
    c.dispatch('ssh devbox');
    expect(capturedHandlers).not.toBeNull();
    capturedHandlers!.onExit('mock-pty-1', 0);
    expect(c.view().map((t) => t.label)).not.toContain('devbox');
  });

  it('closing the ssh tab kills its PTY', () => {
    const { c } = makeController();
    c.dispatch('ssh devbox');
    const index = c.view().findIndex((t) => t.label === 'devbox');
    c.closeTab(index);
    expect(capturedKill).toHaveBeenCalled();
    expect(c.view().map((t) => t.label)).not.toContain('devbox');
  });

  it('connection close ssh:devbox from another tab kills the PTY', () => {
    const { c } = makeController();
    c.dispatch('ssh devbox');
    c.setActiveTab(0); // dispatch from janus, not the ssh tab (which has no command bar)
    c.dispatch('connection close ssh:devbox');
    expect(capturedKill).toHaveBeenCalled();
  });

  it('ssh with no destination produces a usage error in the transcript (not a tab)', () => {
    const { c } = makeController();
    c.dispatch('ssh');
    expect(allText(c)).toContain('Usage');
    expect(c.view().map((t) => t.label)).not.toContain('ssh');
    expect(vi.mocked(spawnPty)).not.toHaveBeenCalled();
  });

  it('regression: shell ssh host still opens an inline terminal card, not an ssh tab', () => {
    const { c } = makeController();
    c.dispatch('shell ssh host');
    expect(c.view().map((t) => t.label)).not.toContain('host');
    expect(c.view()[0].activePty).toBeDefined();
  });
});

describe('Controller send command', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockClear();
    vi.mocked(spawnPty).mockImplementation((program, _command, _cwd, _handlers) => {
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
  });

  it('delivers text to a harness tab as raw PTY input, followed by a separate Enter', async () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    c.dispatch('send claude /standup');
    const pty = vi.mocked(spawnPty).mock.results[0].value as { write: ReturnType<typeof vi.fn> };
    expect(pty.write).toHaveBeenCalledWith('/standup');
    await vi.waitFor(() => expect(pty.write).toHaveBeenCalledWith('\r'));
  });

  it('delivers text to an agent tab by dispatching it as a command', () => {
    const { c } = makeController();
    c.dispatch('agent worker');
    c.dispatch('send worker state');
    expect(c.view().find((t) => t.label === 'worker')!.cmdHistory).toContain('state');
  });

  it('errors when the target tab does not exist', () => {
    const { c } = makeController();
    c.dispatch('send nobody hi');
    expect(allText(c)).toContain('No tab named "nobody".');
  });

  it('delivers text to a tab addressed by its display alias', () => {
    const { c } = makeController();
    c.dispatch('agent worker');
    c.setActiveTab(c.view().findIndex((t) => t.label === 'worker'));
    c.dispatch('rename reviewer'); // worker now displays as "reviewer"
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus'));
    c.dispatch('send reviewer state'); // addressed by alias, not label
    expect(c.view().find((t) => t.label === 'worker')!.cmdHistory).toContain('state');
  });

  it('errors when the target harness has exited', () => {
    const { c } = makeController();
    c.dispatch('harness claude');
    const tab = c.view().find((t) => t.label === 'claude')!;
    tab.harness!.status = 'exited';
    c.dispatch('send claude /standup');
    expect(allText(c)).toContain('is not a running harness');
  });

  it('composes with schedule: a fired scheduled send reaches the target without the comment marker', () => {
    vi.useFakeTimers();
    try {
      initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-sched-send-')));
      const { c } = makeController();
      c.dispatch('harness claude');
      c.managers.tab.setActiveTab(0); // schedule owned by janus, not the harness tab it targets
      c.dispatch('schedule s1 every 1m send claude /standup');
      vi.advanceTimersByTime(61_050);
      const pty = vi.mocked(spawnPty).mock.results[0].value as { write: ReturnType<typeof vi.fn> };
      expect(pty.write).toHaveBeenCalledWith('/standup');
      expect(pty.write).toHaveBeenCalledWith('\r');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Controller schedule in another tab', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockClear();
    vi.mocked(spawnPty).mockImplementation((program, _command, _cwd, _handlers) => {
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
  });

  it('an `in <tab>` entry shows in the target tab view, not the issuing tab', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-sched-in-')));
    const { c } = makeController();
    c.dispatch('agent worker');
    c.setActiveTab(0);
    c.dispatch('schedule sweep in worker every 1h db vacuum');
    expect(c.view().find((t) => t.label === 'worker')!.schedule.map((s) => s.id)).toContain('sweep');
    expect(c.view().find((t) => t.label === 'janus')!.schedule).toHaveLength(0);
    expect(allText(c)).toContain('Scheduled sweep in worker');
  });

  it('a schedule attached to a harness tab types the due command into its PTY', () => {
    vi.useFakeTimers();
    try {
      initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-sched-harness-')));
      const { c } = makeController();
      c.dispatch('harness claude');
      c.managers.tab.setActiveTab(0);
      c.dispatch('schedule standup in claude every 1m /standup');
      expect(c.view().find((t) => t.label === 'claude')!.schedule.map((s) => s.id)).toContain('standup');
      vi.advanceTimersByTime(61_050);
      const pty = vi.mocked(spawnPty).mock.results[0].value as { write: ReturnType<typeof vi.fn> };
      expect(pty.write).toHaveBeenCalledWith('/standup');
      expect(pty.write).toHaveBeenCalledWith('\r');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Controller messageBus', () => {
  const collect = () => {
    const events: BusEvent[] = [];
    messageBus.on('transcript', ['entry:appended', 'entries:trimmed', 'tab:cleared', 'tab:removed'], (e) => { events.push(e); });
    return events;
  };

  it('emits entry:appended with correct tabLabel and entry when a command appends', () => {
    const { c } = makeController();
    const events = collect();
    c.dispatch('help');
    const appended = events.filter((e) => e.type === 'entry:appended');
    expect(appended.length).toBeGreaterThan(0);
    expect(appended[0].tabLabel).toBe('janus');
    expect(appended[0].type).toBe('entry:appended');
  });

  it('emitted entry:appended carries a tab reflecting the post-append log', () => {
    const { c } = makeController();
    const events = collect();
    c.dispatch('help');
    const appended = events.find((e) => e.type === 'entry:appended');
    expect(appended).toBeDefined();
    if (appended?.type === 'entry:appended') {
      expect(appended.tab.log.length).toBeGreaterThan(0);
    }
  });

  it('emits tab:cleared when the clear command runs', () => {
    const { c } = makeController();
    const events = collect();
    c.dispatch('help');
    c.dispatch('clear');
    expect(events.some((e) => e.type === 'tab:cleared' && e.tabLabel === 'janus')).toBe(true);
  });

  it('emits tab:removed when closeTab is called', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    const events = collect();
    const index = c.view().findIndex((t) => t.label === 'bob');
    c.closeTab(index);
    expect(events.some((e) => e.type === 'tab:removed' && e.tabLabel === 'bob')).toBe(true);
  });

  it('emits entries:trimmed before entry:appended when cap is exceeded', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-bus-cap-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'config.json'), JSON.stringify({ transcriptMaxLines: 3 }));
    try {
      loadConfig(root);
      const { c } = makeController();
      // `agent fooN` appended to the creator tab (janus) each time
      c.dispatch('agent foo1');
      c.setActiveTab(0);
      c.dispatch('agent foo2');
      c.setActiveTab(0);
      c.dispatch('agent foo3');
      c.setActiveTab(0);
      const events: BusEvent[] = [];
      messageBus.on('transcript', ['entry:appended', 'entries:trimmed'], (e) => { events.push(e); });
      // 4th dispatch exceeds cap=3, triggering entries:trimmed then entry:appended
      c.dispatch('agent foo4');
      const trimIdx = events.findIndex((e) => e.type === 'entries:trimmed');
      const appendIdx = events.findIndex((e) => e.type === 'entry:appended');
      expect(trimIdx).toBeGreaterThanOrEqual(0);
      expect(appendIdx).toBeGreaterThan(trimIdx);
    } finally {
      loadConfig(mkdtempSync(path.join(tmpdir(), 'janus-bus-cap-reset-')));
    }
  });

  it('existing controller tests are unaffected (no-subscriber safety)', () => {
    const { c } = makeController();
    // No subscriber — dispatch runs normally
    c.dispatch('help');
    expect(c.view()[0].bufferLines.some((l) => l.type === 'markdown')).toBe(true);
  });
});

describe('Controller unread badge', () => {
  it('append to a non-active tab sets hasUnread', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    const bobIndex = c.view().findIndex((t) => t.label === 'bob');
    expect(c.managers.tab.activeTab).not.toBe(bobIndex);
    c.managers.tab.append('bob', { input: 'hello', output: 'world' });
    expect(c.view().find((t) => t.label === 'bob')!.hasUnread).toBe(true);
  });

  it('append to the active tab does not set hasUnread', () => {
    const { c } = makeController();
    c.managers.tab.append('janus', { input: 'test', output: 'out' });
    expect(c.view().find((t) => t.label === 'janus')!.hasUnread).toBe(false);
  });

  it('setActiveTab clears hasUnread on the newly active tab', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.managers.tab.append('bob', { input: 'hello', output: 'world' });
    expect(c.view().find((t) => t.label === 'bob')!.hasUnread).toBe(true);
    const bobIndex = c.view().findIndex((t) => t.label === 'bob');
    c.managers.tab.setActiveTab(bobIndex);
    expect(c.view().find((t) => t.label === 'bob')!.hasUnread).toBe(false);
  });

  it('finishRunning to a non-active tab sets hasUnread', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.managers.tab.startRunning('bob', 'sleep 1');
    c.managers.tab.finishRunning('bob', 'done');
    expect(c.view().find((t) => t.label === 'bob')!.hasUnread).toBe(true);
  });

  it('dispatch records a global history entry with the tab label and strips comments', () => {
    initGlobalHistory(mkdtempSync(path.join(tmpdir(), 'janus-ghist-ctrl-')));
    const { c } = makeController();
    c.dispatch('echo hello ## scheduled ##');
    const commands = globalCommands();
    expect(commands).toContain('echo hello');
    expect(commands).not.toContain('echo hello ## scheduled ##');
  });
});

describe('Controller profile launch (harness entries)', () => {
  const writeHarnessEntry = (root: string, profile: string, filename: string, entry: Record<string, unknown>) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${filename}.json`), JSON.stringify({ harness: 'opencode', ...entry }));
  };

  beforeEach(() => {
    vi.mocked(spawnPty).mockClear();
  });

  it('opens a harness tab running a command with --model, and schedules the recurring entry plus a run one-shot', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'small-fix', 'opencode', {
      model: 'opencode-go/deepseek-v4-pro',
      run: ['execute ./ai/fix-a-small-issue.md'],
      schedule: ['small-fix every 30m execute ./ai/fix-a-small-issue.md'],
    });
    let capturedCommand = '';
    vi.mocked(spawnPty).mockImplementation((program, command, _cwd, _handlers) => {
      capturedCommand = command;
      return { id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    const { c } = makeController();
    c.dispatch('profile launch small-fix');
    const tab = c.view().find((t) => t.label === 'opencode');
    expect(tab).toBeDefined();
    expect(tab!.view).toBe('harness');
    expect(capturedCommand).toContain('--model');
    const scheduleIds = tab!.schedule.map((s) => s.id);
    expect(scheduleIds).toContain('small-fix');
    expect(scheduleIds).toContain('run-1');
  });

  it('the first scheduler tick types the run one-shot into the PTY and drops it', () => {
    vi.useFakeTimers();
    try {
      const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-run-'));
      initProfileDir(root);
      writeHarnessEntry(root, 'small-fix', 'opencode', { run: ['execute ./ai/fix-a-small-issue.md'] });
      const write = vi.fn();
      vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write, resize: vi.fn(), kill: vi.fn() }));
      const { c } = makeController();
      c.dispatch('profile launch small-fix');
      vi.advanceTimersByTime(1050);
      expect(write).toHaveBeenCalledWith('execute ./ai/fix-a-small-issue.md');
      expect(write).toHaveBeenCalledWith('\r');
      const tab = c.view().find((t) => t.label === 'opencode');
      expect(tab!.schedule.map((s) => s.id)).not.toContain('run-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('advancing 30 minutes fires the recurring entry, which stays scheduled', () => {
    vi.useFakeTimers();
    try {
      const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-recur-'));
      initProfileDir(root);
      writeHarnessEntry(root, 'small-fix', 'opencode', { schedule: ['small-fix every 30m execute ./ai/fix-a-small-issue.md'] });
      const write = vi.fn();
      vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write, resize: vi.fn(), kill: vi.fn() }));
      const { c } = makeController();
      c.dispatch('profile launch small-fix');
      vi.advanceTimersByTime(30 * 60 * 1000 + 1050);
      expect(write).toHaveBeenCalledWith('execute ./ai/fix-a-small-issue.md');
      expect(write).toHaveBeenCalledWith('\r');
      const after = c.view().find((t) => t.label === 'opencode')!.schedule.find((s) => s.id === 'small-fix');
      expect(after).toBeDefined();
      expect(after!.recurring).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports and skips an unknown harness name', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-badname-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'bad', 'thing', { harness: 'gemini' });
    vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }));
    const { c } = makeController();
    c.dispatch('profile launch bad');
    expect(allText(c)).toContain('unknown harness');
    expect(c.view().map((t) => t.label)).not.toContain('thing');
  });

  it('reports and skips a model missing from the catalog', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-badmodel-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'bad-model', 'opencode', { model: 'no-such-model' });
    vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }));
    const { c } = makeController();
    c.dispatch('profile launch bad-model');
    expect(allText(c)).toContain('Unknown model');
    expect(c.view().map((t) => t.label)).not.toContain('opencode');
  });

  it('reports and skips a malformed schedule string, still opening the tab', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-badsched-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'bad-sched', 'opencode', { schedule: ['not a valid schedule line'] });
    vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }));
    const { c } = makeController();
    c.dispatch('profile launch bad-sched');
    expect(c.view().map((t) => t.label)).toContain('opencode');
    expect(allText(c)).toContain('Usage');
  });

  it('relaunching the profile closes the old tab (killing its PTY) and opens a fresh one with a re-based schedule', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-relaunch-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'small-fix', 'opencode', { schedule: ['small-fix every 30m execute ./ai/fix-a-small-issue.md'] });
    const kills = [vi.fn(), vi.fn()];
    let call = 0;
    vi.mocked(spawnPty).mockImplementation((program) => {
      const id = `mock-pty-${++call}`;
      return { id, program, write: vi.fn(), resize: vi.fn(), kill: kills[call - 1] };
    });
    const { c } = makeController();
    c.dispatch('profile launch small-fix');
    expect(c.view().find((t) => t.label === 'opencode')!.harness!.ptyId).toBe('mock-pty-1');
    c.setActiveTab(0); // back to janus — relaunching from the just-opened harness tab would self-skip
    c.dispatch('profile launch small-fix');
    expect(kills[0]).toHaveBeenCalled();
    const tabs = c.view().filter((t) => t.label === 'opencode');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].harness!.ptyId).toBe('mock-pty-2');
  });

  it('a profile entry matching the issuing tab label is reported and skipped; the issuing tab stays open', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-profile-harness-self-'));
    initProfileDir(root);
    writeHarnessEntry(root, 'self', 'janus', {});
    vi.mocked(spawnPty).mockImplementation((program) => ({ id: 'mock-pty-1', program, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }));
    const { c } = makeController();
    c.dispatch('profile launch self');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
    expect(allText(c)).toContain('issuing tab');
  });
});

describe('Controller files tab', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-files-'));
  });

  it('files opens a new tab with view "files" and rows in view()', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'README.md'), '');
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    const tab = c.view().find((t) => t.view === 'files');
    expect(tab).toBeDefined();
    expect(tab!.files?.root).toBe(abbreviatePath(root, { root: process.cwd() }));
    expect(tab!.files?.rows.map((r) => r.path)).toEqual(['..', 'src', 'README.md']);
  });

  it('errors into the transcript for a non-directory target, without opening a tab', () => {
    writeFileSync(path.join(root, 'file.txt'), '');
    const { c } = makeController();
    c.dispatch(`files ${path.join(root, 'file.txt')}`);
    expect(allText(c)).toContain('not a directory');
    expect(c.view().some((t) => t.view === 'files')).toBe(false);
  });

  it('fileTreeToggle RPC expands a directory row', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    c.fileTreeToggle(index, 'src');
    const tab = c.view()[index];
    expect(tab.files?.rows.some((r) => r.path === 'src/index.ts')).toBe(true);
  });

  it('fileTreeCollapseAll RPC collapses every expanded directory', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    c.fileTreeToggle(index, 'src');
    c.fileTreeCollapseAll(index);
    const tab = c.view()[index];
    expect(tab.files?.rows.some((r) => r.path === 'src/index.ts')).toBe(false);
  });

  it('fileTreeReroot RPC re-roots the tree to the parent directory', () => {
    mkdirSync(path.join(root, 'sub'));
    const { c } = makeController();
    c.dispatch(`files ${path.join(root, 'sub')}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    c.fileTreeReroot(index);
    const tab = c.view()[index];
    expect(tab.files?.root).toBe(abbreviatePath(root, { root: process.cwd() }));
    expect(tab.files?.rows.some((r) => r.path === 'sub')).toBe(true);
  });

  it('fileTreeReroot RPC on an out-of-range index does nothing', () => {
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    expect(() => c.fileTreeReroot(99)).not.toThrow();
  });

  it('closing a files tab disposes its watchers without throwing', () => {
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    expect(() => c.closeTab(index)).not.toThrow();
    expect(c.view().some((t) => t.view === 'files')).toBe(false);
  });
});

describe('Controller sidebar docking', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-dock-'));
  });

  it('files left docks a new tab into the left sidebar without making it active', () => {
    const { c } = makeController();
    c.dispatch(`files left ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    expect(c.view()[index].dock).toBe('left');
    expect(c.managers.tab.activeTab).not.toBe(index);
  });

  it('setDock RPC docks an existing files tab into the right sidebar', () => {
    const { c } = makeController();
    c.dispatch(`files ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    c.setDock(index, 'right');
    expect(c.view()[index].dock).toBe('right');
  });

  it('docking into an occupied side displaces the previous occupant back to center', () => {
    const rootB = mkdtempSync(path.join(tmpdir(), 'janus-dock-b-'));
    const { c } = makeController();
    c.dispatch(`files left ${root}`);
    c.dispatch(`files left ${rootB}`);
    const shortened = abbreviatePath(root, { root: process.cwd() });
    const shortenedB = abbreviatePath(rootB, { root: process.cwd() });
    expect(c.view().find((t) => t.files?.root === shortened)?.dock).toBeUndefined();
    expect(c.view().find((t) => t.files?.root === shortenedB)?.dock).toBe('left');
  });

  it('bare files on a docked root undocks it to center and activates it', () => {
    const { c } = makeController();
    c.dispatch(`files left ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    c.dispatch(`files ${root}`);
    expect(c.view()[index].dock).toBeUndefined();
    expect(c.managers.tab.activeTab).toBe(index);
  });

  it('setActiveTab RPC is a no-op against a docked tab index', () => {
    const { c } = makeController();
    c.dispatch(`files left ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    const before = c.managers.tab.activeTab;
    c.setActiveTab(index);
    expect(c.managers.tab.activeTab).toBe(before);
  });

  it('moveTab (next-tab cycling) skips a docked tab', () => {
    const { c } = makeController();
    c.dispatch(`agent bob`);
    c.dispatch(`files left ${root}`);
    c.setActiveTab(0); // janus
    c.moveTab(1);
    expect(c.view()[c.managers.tab.activeTab].dock).toBeUndefined();
  });

  it('closing a docked tab via its index works even though it is never active', () => {
    const { c } = makeController();
    c.dispatch(`files left ${root}`);
    const index = c.view().findIndex((t) => t.view === 'files');
    expect(() => c.closeTab(index)).not.toThrow();
    expect(c.view().some((t) => t.view === 'files')).toBe(false);
  });
});

describe('Controller notifications feed', () => {
  const withConfig = (events: Record<string, boolean>) => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-notif-'));
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'config.json'), JSON.stringify({ notifications: { events } }));
    loadConfig(root);
  };
  const reset = () => loadConfig(mkdtempSync(path.join(tmpdir(), 'janus-notif-reset-')));

  const feedText = (c: Controller) =>
    c.view().find((t) => t.view === 'notifications')!.bufferLines.map((l) => l.text).join('\n');

  it('records an incoming message to a background tab when the notifications tab is open', () => {
    withConfig({ incomingMessage: true, stateChange: false, scheduleFire: false, agentStart: false });
    try {
      const { c } = makeController();
      c.dispatch('agent bob');
      openNotificationsTab(c.managers);
      c.setActiveTab(c.view().findIndex((t) => t.label === 'janus')); // janus active; bob is a background tab
      c.dispatch('msg bob info hello there');
      expect(feedText(c)).toContain('Message from janus in bob');
    } finally {
      reset();
    }
  });

  it('colors the notification dot with the sending tab\'s own dotColor', () => {
    withConfig({ incomingMessage: true, stateChange: false, scheduleFire: false, agentStart: false });
    try {
      const { c } = makeController();
      c.dispatch('agent bob');
      const bobColor = c.view().find((t) => t.label === 'bob')!.dotColor;
      openNotificationsTab(c.managers);
      c.setActiveTab(c.view().findIndex((t) => t.label === 'janus')); // janus active; bob is a background tab
      c.dispatch('msg bob info hello there');
      const line = c.view().find((t) => t.view === 'notifications')!.bufferLines.find((l) => l.type === 'message');
      expect(line?.from).toMatch(/ bob$/); // header is "<time> bob"
      expect(line?.fromColor).toBe(bobColor);
    } finally {
      reset();
    }
  });

  it('leads each recorded notification header with a 12-hour timestamp', () => {
    withConfig({ incomingMessage: true, stateChange: false, scheduleFire: false, agentStart: false });
    try {
      const { c } = makeController();
      c.dispatch('agent bob');
      openNotificationsTab(c.managers);
      c.setActiveTab(c.view().findIndex((t) => t.label === 'janus'));
      c.dispatch('msg bob info hello there');
      const line = c.view().find((t) => t.view === 'notifications')!.bufferLines.find((l) => l.type === 'message');
      expect(line?.from).toMatch(/^\d{1,2}:\d{2}(am|pm) bob$/);
      expect(line?.text).toBe('Message from janus in bob');
    } finally {
      reset();
    }
  });

  it('drops the event (recording nothing, creating no tab) when the notifications tab is closed', () => {
    withConfig({ incomingMessage: true, stateChange: false, scheduleFire: false, agentStart: false });
    try {
      const { c } = makeController();
      c.dispatch('agent bob');
      c.setActiveTab(0);
      c.dispatch('msg bob info hello there');
      expect(c.view().some((t) => t.view === 'notifications')).toBe(false);
    } finally {
      reset();
    }
  });
});

describe('Controller notifications command', () => {
  it('opens a singleton notifications tab and reuses it on a second invocation', () => {
    const { c } = makeController();
    c.dispatch('notifications');
    c.dispatch('notifications');
    expect(c.view().filter((t) => t.view === 'notifications')).toHaveLength(1);
  });

  it('notifications right docks the tab into the right sidebar', () => {
    const { c } = makeController();
    c.dispatch('notifications right');
    expect(c.view().find((t) => t.view === 'notifications')!.dock).toBe('right');
  });

  it('docking the notifications tab into a sidebar already holding a file navigator lets both share it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-notif-dock-'));
    const { c } = makeController();
    c.dispatch(`files right ${root}`);
    c.dispatch('notifications right');
    expect(c.view().find((t) => t.view === 'files')!.dock).toBe('right');
    expect(c.view().find((t) => t.view === 'notifications')!.dock).toBe('right');
  });

  it('docking a second file navigator into that side displaces only the prior file navigator, not the notifications tab', () => {
    const rootA = mkdtempSync(path.join(tmpdir(), 'janus-notif-dock-a-'));
    const rootB = mkdtempSync(path.join(tmpdir(), 'janus-notif-dock-b-'));
    const { c } = makeController();
    c.dispatch('notifications right');
    c.dispatch(`files right ${rootA}`);
    const shortenedA = abbreviatePath(rootA, { root: process.cwd() });
    const shortenedB = abbreviatePath(rootB, { root: process.cwd() });
    c.dispatch(`files right ${rootB}`);
    expect(c.view().find((t) => t.files?.root === shortenedA)?.dock).toBeUndefined();
    expect(c.view().find((t) => t.files?.root === shortenedB)?.dock).toBe('right');
    expect(c.view().find((t) => t.view === 'notifications')!.dock).toBe('right');
  });

  it('bare notifications on a docked tab undocks it to center and makes it active', () => {
    const { c } = makeController();
    c.dispatch('notifications left');
    c.dispatch('notifications');
    const index = c.view().findIndex((t) => t.view === 'notifications');
    expect(c.view()[index].dock).toBeUndefined();
    expect(c.managers.tab.activeTab).toBe(index);
  });
});

describe('Controller rehydrate restores a persisted schedule', () => {
  it('rehydrate re-arms a schedule persisted on the agent state', () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-rehydrate-schedule-')));
    saveAgentState({
      name: 'janus', dotColor: '#5b9cff', active: true,
      schedule: [{ id: 's1', command: 'clear', spec: 'every 1h', nextRun: Date.now() + 3_600_000, recurring: true, intervalMs: 3_600_000 }],
    });
    const { c } = makeController();
    c.rehydrate();
    expect(c.view().find((t) => t.label === 'janus')?.schedule.map((s) => s.id)).toContain('s1');
  });
});

describe('Controller direct RPC delegators', () => {
  it('ptyInput/ptyResize/ptyKill/resize delegate to the pty manager without throwing on unknown ids', () => {
    const { c } = makeController();
    expect(() => c.ptyInput('ghost', 'x')).not.toThrow();
    expect(() => c.ptyResize('ghost', 10, 10)).not.toThrow();
    expect(() => c.ptyKill('ghost')).not.toThrow();
    expect(() => c.resize(100, 30)).not.toThrow();
  });

  it('renameTab RPC sets a display alias without changing the label', () => {
    const { c } = makeController();
    c.renameTab(0, 'reviewer');
    expect(c.view()[0].label).toBe('janus');
    expect(c.view()[0].title).toBe('reviewer');
  });

  it('editQueuedCommand RPC patches the active tab\'s queued entry at the given index', () => {
    const { c } = makeController();
    c.managers.tab.enqueue('janus', 'first');
    c.editQueuedCommand(0, 'edited');
    expect(c.view()[0].commandQueue).toEqual(['edited']);
  });

  it('editQueuedCommand RPC no-ops for an out-of-range index', () => {
    const { c } = makeController();
    c.managers.tab.enqueue('janus', 'first');
    c.editQueuedCommand(5, 'ignored');
    expect(c.view()[0].commandQueue).toEqual(['first']);
  });

  it('deleteQueuedCommand RPC removes the active tab\'s queued entry at the given index', () => {
    const { c } = makeController();
    c.managers.tab.enqueue('janus', 'first');
    c.managers.tab.enqueue('janus', 'second');
    c.deleteQueuedCommand(0);
    expect(c.view()[0].commandQueue).toEqual(['second']);
  });

  it('runSuggestion RPC on an unknown id is a no-op', () => {
    const { c } = makeController();
    expect(() => c.runSuggestion('ghost')).not.toThrow();
  });

  it('rateSuggestion RPC on an unknown id is a no-op', () => {
    const { c } = makeController();
    expect(() => c.rateSuggestion('ghost', true)).not.toThrow();
  });

  it('saveFile throws for an unregistered ref (relayed as an RPC error by the caller)', () => {
    const { c } = makeController();
    expect(() => c.saveFile('/open/unknown', 'x')).toThrow(/unknown file ref/);
  });

  it('complete() offers a group: target for each existing group once more than one exists', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-complete-groups-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles', 'team'), { recursive: true });
    writeFileSync(path.join(root, 'profiles', 'team', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false, group: 7 }));
    const { c } = makeController();
    c.dispatch('profile launch team');
    c.setActiveTab(0);
    const res = c.complete('monitor foo ', 'monitor foo '.length);
    expect(res.matches).toContain('group:7');
  });
});
