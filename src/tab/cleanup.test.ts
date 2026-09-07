import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeTabResources } from './cleanup.js';
import { makeTab } from './index.js';
import { messageBus } from '../bus.js';
import { initAgentStateDirectory, saveAgentState } from '../agent/state.js';
import { TranscriptStore } from '../transcript/store.js';
import type { Managers } from '../managers.js';

function makeManagers(): Managers {
  return {
    workspace: { release: vi.fn(), cancel: vi.fn() },
    shell: { closeTab: vi.fn() },
    acp: { closeTab: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    tab: { deleteBusy: vi.fn(), forgetPersisted: vi.fn() },
    fileNavigator: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    schedule: { closeTab: vi.fn() },
    questions: { closeTab: vi.fn() },
    database: { forgetTab: vi.fn(), closeTab: vi.fn(), closeAll: vi.fn() },
    remote: { closeTab: vi.fn() },
  } as unknown as Managers;
}

describe('closeTabResources', () => {
  it('closes every per-tab resource keyed by the tab label', () => {
    const tab = makeTab('main', 'red');
    const managers = makeManagers();

    closeTabResources(tab, managers, new Map(), 2);

    expect(managers.shell.closeTab).toHaveBeenCalledWith('main');
    expect(managers.acp.closeTab).toHaveBeenCalledWith('main');
    expect(managers.browser.closeTab).toHaveBeenCalledWith('main');
    expect(managers.pty.closeTab).toHaveBeenCalledWith('main');
    expect(managers.fileNavigator.closeTab).toHaveBeenCalledWith('main');
    expect(managers.editorWatch.closeTab).toHaveBeenCalledWith('main');
    expect(managers.editorAcp.closeTab).toHaveBeenCalledWith('main');
    expect(managers.schedule.closeTab).toHaveBeenCalledWith('main');
    expect(managers.questions.closeTab).toHaveBeenCalledWith('main');
    expect(managers.database.closeTab).toHaveBeenCalledWith('main');
  });

  it('walks exactly the registry managers that define closeTab, skipping the stated exceptions', () => {
    const tab = makeTab('main', 'red');
    const visited: string[] = [];
    const managers = makeManagers();
    for (const name of ['shell', 'schedule', 'pty', 'editorAcp', 'editorWatch', 'fileNavigator', 'acp', 'browser', 'questions', 'database'] as const) {
      const walk = (managers[name] as unknown as { closeTab: ReturnType<typeof vi.fn> }).closeTab;
      walk?.mockImplementation((_label: string) => { visited.push(name as string); });
    }
    for (const name of ['monitor', 'command', 'communication', 'connection', 'profile', 'ssh', 'harness', 'openFile', 'gitSync', 'plugins', 'conversations', 'remote']) {
      (managers as unknown as Record<string, unknown>)[name] = undefined;
    }

    closeTabResources(tab, managers, new Map(), 2);

    expect(visited).toEqual(['shell', 'schedule', 'pty', 'editorAcp', 'editorWatch', 'fileNavigator', 'acp', 'browser', 'questions', 'database']);
  });

  it('releases the remote channel only when the closed tab carries the remote payload', () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);
    expect(managers.remote.closeTab).not.toHaveBeenCalled();

    const remote = { ...makeTab('claude', 'red'), remote: { address: 'devbox', host: 'devbox' } };
    closeTabResources(remote, managers, new Map(), 2);
    expect(managers.remote.closeTab).toHaveBeenCalledWith('claude');
  });

  it('removes the workspace clone in the background only when the tab has one', async () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);

    const workspaced = { ...makeTab('ws', 'red'), workspaceDir: '/tmp/ws-main' };
    closeTabResources(workspaced, managers, new Map(), 2);
    // Deferred off the synchronous close path so the rmSync of the clone can't freeze the UI.
    expect(managers.workspace.release).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(managers.workspace.release).toHaveBeenCalledTimes(1);
    expect(managers.workspace.release).toHaveBeenCalledWith('/tmp/ws-main');
  });

  it('cancels an in-flight clone immediately when closing a still-provisioning tab', () => {
    const managers = makeManagers();
    const workspaced = { ...makeTab('ws', 'red'), label: 'ws', workspaceDir: '/tmp/ws-provisioning' };

    closeTabResources(workspaced, managers, new Map(), 2);

    expect(managers.workspace.cancel).toHaveBeenCalledWith('ws');
  });

  // The regression this guards: a remote tab's clone lives on the other host, so storing its path
  // in `workspaceDir` would point a local recursive delete at a path that means something else
  // entirely on this machine. A remote tab leaves that field unset, and closing it must delete
  // nothing locally.
  it('schedules no local workspace removal when closing a remote tab', async () => {
    const managers = makeManagers();
    const remote = {
      ...makeTab('claude', 'red'),
      label: 'claude',
      remote: { address: 'devbox:/srv/proj', host: 'devbox' },
    };

    closeTabResources(remote, managers, new Map(), 2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(managers.workspace.release).not.toHaveBeenCalled();
    expect(managers.workspace.cancel).not.toHaveBeenCalled();
  });

  it('still removes a local workspaced tab\'s clone alongside remote tabs', async () => {
    const managers = makeManagers();
    const remote = { ...makeTab('claude', 'red'), workspaceDir: undefined };
    const local = { ...makeTab('ws', 'red'), workspaceDir: '/tmp/ws-local' };

    closeTabResources(remote, managers, new Map(), 3);
    closeTabResources(local, managers, new Map(), 3);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(managers.workspace.release).toHaveBeenCalledTimes(1);
    expect(managers.workspace.release).toHaveBeenCalledWith('/tmp/ws-local');
  });

  it('does not cancel anything for a tab with no workspace', () => {
    const managers = makeManagers();

    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);

    expect(managers.workspace.cancel).not.toHaveBeenCalled();
  });

  it('closes every database connection only when this was the last tab', () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);
    expect(managers.database.closeAll).not.toHaveBeenCalled();

    closeTabResources(makeTab('main', 'red'), managers, new Map(), 1);
    expect(managers.database.closeAll).toHaveBeenCalledTimes(1);
  });

  it('emits a tab:removed transcript event', () => {
    const managers = makeManagers();
    const emitSpy = vi.spyOn(messageBus, 'emit');

    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);

    expect(emitSpy).toHaveBeenCalledWith('transcript', { type: 'tab:removed', tabLabel: 'main' });
    emitSpy.mockRestore();
  });

  it('drops every plugin-owned reference and leaves unrelated references', () => {
    const managers = makeManagers();
    const tab = {
      ...makeTab('video', 'red'),
      plugin: {
        id: 'video', instanceKey: '/tmp/clip.mp4', schemaVersion: 1,
        payload: {}, fileRefs: ['video', 'poster'], sourceLabel: 'main',
      },
    };
    const openFiles = new Map([
      ['video', '/tmp/clip.mp4'], ['poster', '/tmp/poster.png'], ['keep', '/tmp/keep.txt'],
    ]);

    closeTabResources(tab, managers, openFiles, 2);

    expect([...openFiles]).toEqual([['keep', '/tmp/keep.txt']]);
  });

  it('leaves unrelated open-file entries untouched for a plain agent tab', () => {
    const managers = makeManagers();
    const openFiles = new Map([['keep', '/tmp/keep.png']]);

    closeTabResources(makeTab('main', 'red'), managers, openFiles, 2);

    expect(openFiles.has('keep')).toBe(true);
  });

  it('drops an editor-owned reference and leaves unrelated references', () => {
    const managers = makeManagers();
    const tab = {
      ...makeTab('notes.txt', 'red'),
      editor: { name: 'notes.txt', path: '/tmp/notes.txt', size: '1 B', url: '/open/editor' },
    };
    const openFiles = new Map([['editor', '/tmp/notes.txt'], ['keep', '/tmp/keep.txt']]);

    closeTabResources(tab, managers, openFiles, 2);

    expect([...openFiles]).toEqual([['keep', '/tmp/keep.txt']]);
  });
});

// Without these, every tab the user closed stayed on disk and came back together on the next
// `--relaunch` — a session's deliberately-closed agents accumulating silently.
describe('closeTabResources — persisted state', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'janus-close-state-'));
    initAgentStateDirectory(projectDir);
    // eslint-disable-next-line no-new -- the constructor is what binds the transcript directory
    new TranscriptStore(projectDir);
  });

  const statePath = (label: string) => path.join(projectDir, '.janissary', 'state', `${label}.json`);
  const transcriptPath = (label: string) => path.join(projectDir, '.janissary', 'transcripts', `${label}.json`);

  it('removes the closed tab\'s agent-state and transcript files', () => {
    saveAgentState({ name: 'main', dotColor: 'red', active: false });
    TranscriptStore.save('main', [{ input: 'ls', output: 'a' }]);
    expect(existsSync(statePath('main'))).toBe(true);
    expect(existsSync(transcriptPath('main'))).toBe(true);

    closeTabResources(makeTab('main', 'red'), makeManagers(), new Map(), 2);

    expect(existsSync(statePath('main'))).toBe(false);
    expect(existsSync(transcriptPath('main'))).toBe(false);
  });

  it('leaves another tab\'s files alone', () => {
    saveAgentState({ name: 'main', dotColor: 'red', active: false });
    saveAgentState({ name: 'other', dotColor: 'blue', active: false });

    closeTabResources(makeTab('main', 'red'), makeManagers(), new Map(), 2);

    expect(existsSync(statePath('other'))).toBe(true);
  });

  // The refusal goes up before the files come down, so a write arriving from an async callback in
  // between — a shell command finishing after its tab closed — cannot recreate them.
  it('refuses further writes for the label before removing its files', () => {
    saveAgentState({ name: 'main', dotColor: 'red', active: false });
    const managers = makeManagers();
    const order: string[] = [];
    (managers.tab.forgetPersisted as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push(existsSync(statePath('main')) ? 'file still there' : 'file already gone');
    });

    closeTabResources(makeTab('main', 'red'), managers, new Map(), 2);

    expect(managers.tab.forgetPersisted).toHaveBeenCalledWith('main');
    expect(order).toEqual(['file still there']);
  });

  it('closing a tab that was never persisted removes nothing and does not throw', () => {
    mkdirSync(path.join(projectDir, '.janissary', 'state'), { recursive: true });
    writeFileSync(path.join(projectDir, '.janissary', 'state', 'keep.json'), '{}');

    expect(() => {
      closeTabResources(makeTab('ghost', 'red'), makeManagers(), new Map(), 2);
    }).not.toThrow();
    expect(existsSync(path.join(projectDir, '.janissary', 'state', 'keep.json'))).toBe(true);

    rmSync(projectDir, { recursive: true, force: true });
  });
});
