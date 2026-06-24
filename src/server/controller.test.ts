import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller } from './controller.js';
import { initAgentStateDir, saveAgentState } from '../agent-state.js';
import { initProfileDir } from '../profiles.js';
import { initLogDir, getLogDir } from '../logger.js';
import { agentNames } from '../commands.js';

// Sinks that just count state emissions; no PTY/shell spawning is exercised here.
const makeController = () => {
  let states = 0;
  const c = new Controller({ emitState: () => { states++; }, sendPty: () => {}, sendPtyExit: () => {} });
  return { c, get states() { return states; } };
};

const allText = (c: Controller) => c.view().flatMap((t) => t.bufferLines).map((l) => l.text).join('\n');

describe('Controller', () => {
  it('starts with a single janus tab', () => {
    const { c } = makeController();
    expect(c.view()).toHaveLength(1);
    expect(c.view()[0].label).toBe('janus');
  });

  it('routes a built-in with output into the transcript', () => {
    const { c } = makeController();
    c.dispatch('help');
    expect(c.view()[0].bufferLines.some((l) => l.type === 'output')).toBe(true);
  });

  it('clears the transcript with clear', () => {
    const { c } = makeController();
    c.dispatch('help');
    c.dispatch('clear');
    expect(c.view()[0].bufferLines).toHaveLength(0);
  });

  it('creates a named agent tab without switching focus to it', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    expect(c.view().map((t) => t.label)).toContain('bob');
    // Focus stays on the creator (janus), mirroring the Ink behavior.
    expect(c.view()[c.activeTab].label).toBe('janus');
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
    const root = mkdtempSync(join(tmpdir(), 'janus-prof-'));
    initProfileDir(root); // profiles live under <root>/profiles/<name>
    mkdirSync(join(root, 'profiles', 'writing'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'writing', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false }));
    const { c } = makeController();
    c.dispatch('profile launch writing');
    const janus = c.view().find((t) => t.label === 'janus')!;
    const writer = c.view().find((t) => t.label === 'writer')!;
    expect(writer).toBeDefined();
    expect(writer.group).not.toBe(janus.group);
  });

  it('quit asks the host to exit', () => {
    let exited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { exited = true; } });
    c.dispatch('quit');
    expect(exited).toBe(true);
  });

  it('exit also stops the host (closes the window + server)', () => {
    let exited = false;
    const c = new Controller({ emitState() {}, sendPty() {}, sendPtyExit() {}, exit() { exited = true; } });
    c.dispatch('exit');
    expect(exited).toBe(true);
  });

  it('close removes the active tab and its connections', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(1);
    c.dispatch('close');
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
  });

  it('closing the last tab opens a fresh janus tab', () => {
    const { c } = makeController();
    c.dispatch('help'); // give janus some transcript
    expect(c.view()[0].bufferLines.length).toBeGreaterThan(0);
    c.dispatch('close'); // last tab -> reset to a fresh janus
    expect(c.view().map((t) => t.label)).toEqual(['janus']);
    expect(c.view()[0].bufferLines).toHaveLength(0);
  });

  it('starts an agent shell in its saved/workspace cwd', async () => {
    initAgentStateDir(mkdtempSync(join(tmpdir(), 'janus-st-')));
    const workCwd = realpathSync(mkdtempSync(join(tmpdir(), 'janus-work-')));
    saveAgentState({ name: 'bob', dotColor: '#6bcb77', active: false, number: 1, cwd: workCwd });
    const { c } = makeController();
    c.rehydrate(); // restores the bob tab with cwd = workCwd
    c.dispatch('shell pwd'); // runs in bob's shell, which should have cd'd into workCwd
    const deadline = Date.now() + 4000;
    while (!allText(c).includes(workCwd) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(allText(c)).toContain(workCwd);
    c.shutdown();
  });

  it('records transcript content in the append-only log', () => {
    initLogDir(mkdtempSync(join(tmpdir(), 'janus-log-')));
    const { c } = makeController();
    c.dispatch('help');
    const files = readdirSync(getLogDir()).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const entries = readFileSync(join(getLogDir(), files[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // The command input and its output are logged as separate entries, each timestamped HH:MM:SS.mmm.
    expect(entries.some((e) => e.agent === 'janus' && e.text === 'help')).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((e) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(e.timestamp))).toBe(true);
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
    expect(c.activeTab).toBe(0);
    c.moveTab(1);
    expect(c.activeTab).toBe(1);
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
    expect(c.view()[c.activeTab].label).toBe('carol'); // focus follows the moved tab
    expect(c.view().map((t) => t.number)).toEqual([1, 2, 3]); // renumbered by position
  });

  it('is a no-op when reordering past the strip edge', () => {
    const { c } = makeController();
    c.dispatch('agent bob');
    c.setActiveTab(0);
    c.reorderTab(-1); // janus is already leftmost
    expect(c.view().map((t) => t.label)).toEqual(['janus', 'bob']);
    expect(c.activeTab).toBe(0);
  });

  it('will not reorder a tab across a group boundary', () => {
    const root = mkdtempSync(join(tmpdir(), 'janus-reorder-'));
    initProfileDir(root);
    mkdirSync(join(root, 'profiles', 'writing'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'writing', 'writer.json'), JSON.stringify({ name: 'writer', dotColor: '#6bcb77', active: false }));
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
    const v = c.view()[c.activeTab];
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
    const msgLine = bob.bufferLines.find((l) => l.type === 'message' && l.from === 'janus');
    expect(msgLine?.text).toContain('hello there');
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
    initProfileDir(mkdtempSync(join(tmpdir(), 'janus-noprof-'))); // isolate from other tests' profiles
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

  it('shows persisted state with the state command', () => {
    initAgentStateDir(mkdtempSync(join(tmpdir(), 'janus-state-')));
    const { c } = makeController();
    c.dispatch('help'); // triggers a persist of the janus tab
    c.dispatch('state');
    expect(allText(c)).toContain('name:');
  });
});
