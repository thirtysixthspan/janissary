import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { openEditorTab } from '../tab/open-editor-tab.js';
import type { TabPluginTopicAction } from './api.js';
import { runscriptTopicAction } from './runscript-topic-actions.js';

const notify = vi.fn();
vi.mock('../notifications/index.js', () => ({ notify: (...args: unknown[]) => notify(...args) }));

const directories: string[] = [];

beforeEach(() => { notify.mockClear(); });

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.length = 0;
});

function projectRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'runscript-topic-'));
  directories.push(root);
  return root;
}

function scriptsDirectory(root: string): string {
  return path.join(root, '.janissary', 'scripts');
}

function writeScripts(root: string, scripts: Record<string, string>): void {
  mkdirSync(scriptsDirectory(root), { recursive: true });
  for (const [name, text] of Object.entries(scripts)) {
    writeFileSync(path.join(scriptsDirectory(root), `${name}.rs`), text);
  }
}

function fixture(root: string, shell: 'ok' | 'failed' = 'ok') {
  const enqueued: string[][] = [];
  const edits: { command: string; target: string; label: string }[] = [];
  const managers = {
    tab: {
      launchDir: root,
      enqueueSystemBatch: (_label: string, lines: string[]) => { enqueued.push(lines); },
    },
    systemShell: {
      ensure: async () => (shell === 'ok' ? { status: 'ok' } : { status: 'failed', reason: 'failed' }),
    },
    openFile: {
      edit: (command: string, target: string, label: string) => { edits.push({ command, target, label }); },
    },
  } as unknown as Managers;
  return { edits, enqueued, managers };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

describe('the runscripts execute action', () => {
  it('posts the missing-file line under the origin tab and enqueues nothing', async () => {
    const { enqueued, managers } = fixture(projectRoot());

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'execute', name: 'deploy', origin: 'janus' });
    await settle();

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'No runscript named "deploy".');
    expect(enqueued).toEqual([]);
  });

  it('enqueues the parsed lines to the system label and posts nothing', async () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'pwd\n# comment\necho done\n' });
    const { enqueued, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'execute', name: 'deploy', origin: 'janus' });
    await settle();

    expect(enqueued).toEqual([['pwd', 'echo done']]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('posts nothing when the system shell is not ready', async () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo hello\n' });
    const { enqueued, managers } = fixture(root, 'failed');

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'execute', name: 'deploy', origin: 'janus' });
    await settle();

    expect(enqueued).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a feed-post rejection to stderr and leaves no unhandled rejection', async () => {
    const { managers } = fixture(projectRoot());
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const unhandled = vi.fn();
    notify.mockImplementationOnce(() => { throw new Error('feed unavailable'); });
    process.on('unhandledRejection', unhandled);

    try {
      runscriptTopicAction(managers, { topic: 'runscripts', action: 'execute', name: 'deploy', origin: 'janus' });
      await settle();

      expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'No runscript named "deploy".');
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining('Runscript execute "deploy" failed: feed unavailable'),
      );
      expect(notify).toHaveBeenNthCalledWith(2, managers, 'plugin-note', 'janus', 'Could not run runscript "deploy".');
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('reports a second feed-post rejection to stderr and leaves no unhandled rejection', async () => {
    const { managers } = fixture(projectRoot());
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const unhandled = vi.fn();
    notify
      .mockImplementationOnce(() => { throw new Error('feed unavailable'); })
      .mockImplementationOnce(() => { throw new Error('feed still unavailable'); });
    process.on('unhandledRejection', unhandled);

    try {
      runscriptTopicAction(managers, { topic: 'runscripts', action: 'execute', name: 'deploy', origin: 'janus' });
      await settle();

      expect(notify).toHaveBeenNthCalledWith(2, managers, 'plugin-note', 'janus', 'Could not run runscript "deploy".');
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining('Runscript execute "deploy" failed: feed still unavailable'),
      );
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('the runscripts delete action', () => {
  it('removes the file and posts nothing', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const { managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'delete', name: 'deploy', origin: 'janus' });

    expect(existsSync(path.join(scriptsDirectory(root), 'deploy.rs'))).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('posts the missing-file line when there is nothing to delete', () => {
    const { managers } = fixture(projectRoot());

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'delete', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'No runscript named "deploy".');
  });

  it('posts the failure line for a symlink and leaves its target in place', () => {
    const root = projectRoot();
    mkdirSync(scriptsDirectory(root), { recursive: true });
    writeFileSync(path.join(root, 'elsewhere.txt'), 'keep');
    symlinkSync(path.join(root, 'elsewhere.txt'), path.join(scriptsDirectory(root), 'deploy.rs'));
    const { managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'delete', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not delete runscript "deploy".');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript delete "deploy" failed: Runscript path is not a regular file'),
    );
    expect(readFileSync(path.join(root, 'elsewhere.txt'), 'utf8')).toBe('keep');
    expect(lstatSync(path.join(scriptsDirectory(root), 'deploy.rs')).isSymbolicLink()).toBe(true);
  });
});

describe('the runscripts clone action', () => {
  it('creates the copy, opens its absolute path as an edit, and posts nothing', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'clone', name: 'deploy', origin: 'janus' });

    const copy = path.join(scriptsDirectory(root), 'deploy-2.rs');
    expect(readFileSync(copy, 'utf8')).toBe('echo deploy\n');
    expect(edits).toEqual([{ command: 'edit deploy-2', target: copy, label: 'janus' }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('takes the next free suffix when a copy already exists', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n', 'deploy-2': 'echo other\n' });
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'clone', name: 'deploy', origin: 'janus' });

    expect(existsSync(path.join(scriptsDirectory(root), 'deploy-3.rs'))).toBe(true);
    expect(edits.map((edit) => edit.command)).toEqual(['edit deploy-3']);
  });

  it('posts the missing-file line when the source is absent', () => {
    const { edits, managers } = fixture(projectRoot());

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'clone', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'No runscript named "deploy".');
    expect(edits).toEqual([]);
  });

  it('posts the failure line when the source is a symlink', () => {
    const root = projectRoot();
    mkdirSync(scriptsDirectory(root), { recursive: true });
    writeFileSync(path.join(root, 'elsewhere.txt'), 'keep');
    symlinkSync(path.join(root, 'elsewhere.txt'), path.join(scriptsDirectory(root), 'deploy.rs'));
    const { edits, managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'clone', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not clone runscript "deploy".');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript clone "deploy" failed: Runscript path is not a regular file'),
    );
    expect(edits).toEqual([]);
  });
});

describe('the runscripts create action', () => {
  it('creates an empty untitled runscript and opens it as a create', () => {
    const root = projectRoot();
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'create', origin: 'janus' });

    const file = path.join(scriptsDirectory(root), 'untitled.rs');
    expect(readFileSync(file, 'utf8')).toBe('');
    expect(edits).toEqual([{ command: 'create script untitled', target: file, label: 'janus' }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('creates and opens untitled-2 when untitled is taken', () => {
    const root = projectRoot();
    writeScripts(root, { untitled: '' });
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'create', origin: 'janus' });

    expect(existsSync(path.join(scriptsDirectory(root), 'untitled-2.rs'))).toBe(true);
    expect(edits.map((edit) => edit.command)).toEqual(['create script untitled-2']);
  });

  it('names the attempted untitled runscript when its chosen file cannot be used', () => {
    const root = projectRoot();
    writeScripts(root, { untitled: '' });
    symlinkSync(path.join(root, 'nowhere.rs'), path.join(scriptsDirectory(root), 'untitled-2.rs'));
    const { edits, managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'create', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not create runscript "untitled-2".');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript create "untitled-2" failed: Runscript path is not a regular file'),
    );
    expect(edits).toEqual([]);
  });

  it('falls back to untitled in the failure line when the directory itself cannot be used', () => {
    const root = projectRoot();
    symlinkSync(projectRoot(), path.join(root, '.janissary'));
    const { edits, managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'create', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not create runscript "untitled".');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript create "untitled" failed: Runscript path is not a real directory'),
    );
    expect(edits).toEqual([]);
  });
});

describe('the runscripts open action', () => {
  it('opens the file as an edit under its absolute path', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' });

    expect(edits).toEqual([{
      command: 'edit deploy', target: path.join(scriptsDirectory(root), 'deploy.rs'), label: 'janus',
    }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('focuses an open editor tab for the same file rather than opening a second', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const file = path.join(scriptsDirectory(root), 'deploy.rs');
    const { edits, managers } = fixture(root);
    runscriptTopicAction(managers, { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' });
    expect(edits).toEqual([{ command: 'edit deploy', target: file, label: 'janus' }]);
    const target = {
      tabs: [{ label: 'editor-1', editor: { name: 'deploy.rs', path: file, size: '10 B', url: '/open/1' } } as Tab],
      activeTab: 0,
      setActiveTab: vi.fn(),
      applyOpenResult: vi.fn(),
      openFiles: new Map<string, string>(),
    };

    const label = openEditorTab(target, { name: 'deploy.rs', path: file, size: '10 B', url: '/open/2' }, vi.fn());

    expect(label).toBe('editor-1');
    expect(target.setActiveTab).toHaveBeenCalledWith(0);
    expect(target.applyOpenResult).not.toHaveBeenCalled();
  });

  it('posts the missing-file line when the file is absent', () => {
    const { edits, managers } = fixture(projectRoot());

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'No runscript named "deploy".');
    expect(edits).toEqual([]);
  });

  it('posts the read-failure line for a symlink and opens nothing', () => {
    const root = projectRoot();
    mkdirSync(scriptsDirectory(root), { recursive: true });
    writeFileSync(path.join(root, 'elsewhere.txt'), 'keep');
    symlinkSync(path.join(root, 'elsewhere.txt'), path.join(scriptsDirectory(root), 'deploy.rs'));
    const { edits, managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' });

    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not read runscript "deploy".');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript open "deploy" failed: Runscript path is not a regular file'),
    );
    expect(edits).toEqual([]);
  });

  it('opens a runscript over the editor size limit without posting to the feed', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'x'.repeat(2 * 1024 * 1024 + 1) });
    const { edits, managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' });

    expect(edits).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('the runscripts name check', () => {
  it.each(['Deploy', 'a--b', ''])('does nothing for the invalid name %j on the four named actions', async (name) => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const { edits, enqueued, managers } = fixture(root);

    for (const action of ['execute', 'delete', 'clone', 'open'] as const) {
      runscriptTopicAction(managers, { topic: 'runscripts', action, name, origin: 'janus' });
    }
    await settle();

    expect(notify).not.toHaveBeenCalled();
    expect(enqueued).toEqual([]);
    expect(edits).toEqual([]);
    expect(existsSync(path.join(scriptsDirectory(root), 'deploy.rs'))).toBe(true);
    expect(existsSync(path.join(scriptsDirectory(root), 'deploy-2.rs'))).toBe(false);
  });
});

describe('the runscripts ensureDirectory action', () => {
  it('creates the state and scripts directories', () => {
    const root = projectRoot();
    const { managers } = fixture(root);

    runscriptTopicAction(managers, { topic: 'runscripts', action: 'ensureDirectory', origin: 'janus' });

    expect(lstatSync(path.join(root, '.janissary')).isDirectory()).toBe(true);
    expect(lstatSync(scriptsDirectory(root)).isDirectory()).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('posts the directory line and does not throw when the state directory is a symlink', () => {
    const root = projectRoot();
    symlinkSync(projectRoot(), path.join(root, '.janissary'));
    const { managers } = fixture(root);

    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => {
      runscriptTopicAction(managers, { topic: 'runscripts', action: 'ensureDirectory', origin: 'janus' });
    }).not.toThrow();
    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Could not use the runscripts directory.');
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Runscript ensureDirectory failed: Runscript path is not a real directory'),
    );
  });
});

describe('the runscripts action return value', () => {
  it('returns nothing from every action', () => {
    const root = projectRoot();
    writeScripts(root, { deploy: 'echo deploy\n' });
    const { managers } = fixture(root);
    const actions: TabPluginTopicAction[] = [
      { topic: 'runscripts', action: 'delete', name: 'missing', origin: 'janus' },
      { topic: 'runscripts', action: 'open', name: 'deploy', origin: 'janus' },
      { topic: 'runscripts', action: 'create', origin: 'janus' },
      { topic: 'runscripts', action: 'ensureDirectory', origin: 'janus' },
    ];

    for (const action of actions) {
      expect(runscriptTopicAction(managers, action)).toBeUndefined();
    }
  });
});
