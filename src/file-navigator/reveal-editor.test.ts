import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '../tab/types.js';
import { LocalFileSystemPort } from './filesystem-port.js';
import type { FileSystemPort } from './filesystem-port.js';
import { pruneAndBuildRows } from './rebuild.js';
import { nextRestoreRevision } from './restore.js';
import { freshFileNavigatorState, type FilesTabState } from './state.js';
import {
  clearRemoteFileCache, forgetRemoteFilesOf, initRemoteFileCache, materializeRemoteFile, remoteFileFor,
} from './remote/file-cache.js';
import { clearRevealFocus, editorRevealBlocked, revealEditorFile, revealTargetFor, type RevealPort } from './reveal-editor.js';

const root = '/repo';
const workspace = '/repo/.janissary/workspace';

describe('revealTargetFor', () => {
  it('roots a synced file at the git-sync clone holding it, though that clone sits inside the root', () => {
    expect(revealTargetFor(`${workspace}/git-sync/src/app.ts`, { clone: `${workspace}/git-sync`, root })).toEqual({
      navigatorRoot: `${workspace}/git-sync`,
      relPath: 'src/app.ts',
    });
  });

  it('roots an agent workspace file at that clone', () => {
    expect(revealTargetFor(`${workspace}/demir/notes.txt`, { clone: `${workspace}/demir`, root })).toEqual({
      navigatorRoot: `${workspace}/demir`,
      relPath: 'notes.txt',
    });
  });

  it('roots a file directly under the project root at the root', () => {
    expect(revealTargetFor(`${root}/notes.txt`, { clone: undefined, root })).toEqual({
      navigatorRoot: root,
      relPath: 'notes.txt',
    });
  });

  it('keeps a nested project file relative to the root with POSIX separators', () => {
    expect(revealTargetFor(`${root}/src/file-navigator/remote/file-cache.ts`, { clone: undefined, root })).toEqual({
      navigatorRoot: root,
      relPath: 'src/file-navigator/remote/file-cache.ts',
    });
  });

  it('roots a file outside the project root at its own directory', () => {
    expect(revealTargetFor('/elsewhere/notes.txt', { clone: undefined, root })).toEqual({
      navigatorRoot: '/elsewhere',
      relPath: 'notes.txt',
    });
  });

  it('does not treat a sibling directory whose name begins with the root name as inside it', () => {
    expect(revealTargetFor('/repo-other/x/notes.txt', { clone: undefined, root })).toEqual({
      navigatorRoot: '/repo-other/x',
      relPath: 'notes.txt',
    });
  });
});

const cacheFilesystem = {} as FileSystemPort;

let project: string | undefined;

afterEach(() => {
  if (project === undefined) return;
  clearRemoteFileCache();
  rmSync(project, { recursive: true, force: true });
  project = undefined;
});

function cachedFile(options: {
  root?: string;
  relPath?: string;
  label?: string;
  filesystem?: FileSystemPort;
} = {}): string {
  project = mkdtempSync(path.join(tmpdir(), 'janus-reveal-editor-'));
  initRemoteFileCache(project);
  const relPath = options.relPath ?? 'notes.txt';
  return materializeRemoteFile(
    { destination: 'devbox', workspaceRoot: '/remote/ws', workspaceLabel: 'claude' },
    relPath, Buffer.from('x'),
    {
      filesystem: options.filesystem ?? cacheFilesystem,
      root: options.root ?? '/remote/ws',
      relPath,
      label: options.label ?? 'files',
    },
  );
}

function editor(fields: Partial<EditorView> = {}): EditorView {
  return { name: 'notes.txt', path: `${root}/notes.txt`, size: '8 B', url: '/open/1', ...fields };
}

describe('editorRevealBlocked', () => {
  it('reports a new file as unsaved', () => {
    expect(editorRevealBlocked(editor({ newFile: true }))).toBe('unsaved');
  });

  it('prefers unsaved over a missing route when both hold', () => {
    const file = cachedFile();
    forgetRemoteFilesOf(cacheFilesystem);
    expect(editorRevealBlocked(editor({ path: file, newFile: true }))).toBe('unsaved');
  });

  it('lets a cached remote file with a live record reveal', () => {
    expect(editorRevealBlocked(editor({ path: cachedFile() }))).toBeUndefined();
  });

  it('reports no route for a cached remote file whose navigator is gone', () => {
    const file = cachedFile();
    forgetRemoteFilesOf(cacheFilesystem);
    expect(editorRevealBlocked(editor({ path: file }))).toBe('no-route');
  });

  it('lets an ordinary local file reveal', () => {
    expect(editorRevealBlocked(editor())).toBeUndefined();
  });
});

const revealRoots: string[] = [];

afterEach(() => {
  for (const dir of revealRoots) rmSync(dir, { recursive: true, force: true });
  revealRoots.length = 0;
});

function revealTree(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-reveal-editor-file-'));
  revealRoots.push(dir);
  mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'deep', 'a.ts'), 'a');
  return dir;
}

function revealFixture(options: {
  launchDir?: string;
  existing?: boolean;
  editor?: Partial<EditorView>;
  dock?: 'left' | 'right';
} = {}) {
  const root = revealTree();
  const state = freshFileNavigatorState(root, new LocalFileSystemPort());
  const tabs: Record<string, unknown>[] = [
    {
      label: 'edit',
      view: 'editor',
      editor: {
        name: 'a.ts', path: path.join(root, 'src', 'deep', 'a.ts'), size: '1 B', url: '/open/1', ...options.editor,
      },
    },
    { label: 'files', ...(options.dock && { dock: options.dock }) },
  ];
  const states = options.existing === false ? new Map<string, FilesTabState>() : new Map([['files', state]]);
  const opened: { root: string }[] = [];
  const setActiveTab = vi.fn((index: number) => {
    const tab = tabs[index];
    if (tab) delete tab.dock;
  });
  const port = {
    states,
    managers: {
      tab: {
        launchDir: options.launchDir ?? root,
        tabs,
        byLabel: (label: string) => tabs.find((tab) => tab.label === label),
        mostRecentFileNavigatorLabel: () => (states.has('files') ? 'files' : undefined),
        findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
        openFilesTab: (arg: { root: string }) => {
          opened.push({ root: arg.root });
          tabs.push({ label: `files-${tabs.length}`, ...arg });
          return tabs.at(-1);
        },
        cur: () => tabs.at(-1),
        setCwd: vi.fn(),
        setActiveTab,
        setDock: vi.fn(),
      },
    },
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    rebuild: vi.fn((label: string) => {
      const current = states.get(label);
      if (current) pruneAndBuildRows(current, () => {});
    }),
    refreshGit: vi.fn(),
    reportFailure: vi.fn(),
    setCwd: vi.fn(),
    hasTab: () => true,
  } as unknown as RevealPort;
  return { root, state, states, port, opened, tabs, setActiveTab };
}

describe('revealEditorFile', () => {
  it('expands every ancestor of a local file and writes a hint naming it', () => {
    const { state, port } = revealFixture();
    const before = nextRestoreRevision();

    revealEditorFile(port, 'edit');

    expect(state.expanded).toEqual(new Set(['src', 'src/deep']));
    expect(state.restore).toMatchObject({
      cursor: 'src/deep/a.ts',
      anchor: 'src/deep/a.ts',
      selected: ['src/deep/a.ts'],
    });
    expect(state.restore?.focus).toBe(true);
    expect(state.restore?.revision).toBeGreaterThan(before);
  });

  it('drops a missing intermediate directory and still writes the hint', () => {
    const { root, state, port } = revealFixture();
    rmSync(path.join(root, 'src', 'deep'), { recursive: true, force: true });

    revealEditorFile(port, 'edit');

    expect(state.expanded).toEqual(new Set(['src']));
    expect(state.restore).toMatchObject({ cursor: 'src/deep/a.ts', selected: ['src/deep/a.ts'] });
  });

  it('changes nothing for an unknown editor label', () => {
    const { state, port, opened, setActiveTab } = revealFixture();

    revealEditorFile(port, 'gone');

    expect(opened).toEqual([]);
    expect(state.expanded.size).toBe(0);
    expect(state.restore).toBeUndefined();
    expect(port.watchDir).not.toHaveBeenCalled();
    expect(port.rebuild).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('changes nothing for a label naming a tab that is not an editor', () => {
    const { state, port, opened, setActiveTab } = revealFixture();

    revealEditorFile(port, 'files');

    expect(opened).toEqual([]);
    expect(state.expanded.size).toBe(0);
    expect(state.restore).toBeUndefined();
    expect(port.watchDir).not.toHaveBeenCalled();
    expect(port.rebuild).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('changes nothing for a blocked editor', () => {
    const { state, port, opened, setActiveTab } = revealFixture({ editor: { newFile: true } });

    revealEditorFile(port, 'edit');

    expect(opened).toEqual([]);
    expect(state.expanded.size).toBe(0);
    expect(state.restore).toBeUndefined();
    expect(port.watchDir).not.toHaveBeenCalled();
    expect(port.rebuild).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('opens nothing and writes no hint for a resolved root that is missing', () => {
    const launchDir = path.join(tmpdir(), 'janus-reveal-editor-absent-root');
    const { port, opened, setActiveTab } = revealFixture({
      launchDir, existing: false, editor: { path: path.join(launchDir, 'notes.txt') },
    });

    revealEditorFile(port, 'edit');

    expect(opened).toEqual([]);
    expect(port.states.size).toBe(0);
    expect(port.watchDir).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('activates a centre-strip navigator and leaves a docked one in its sidebar', () => {
    const centre = revealFixture();
    revealEditorFile(centre.port, 'edit');
    expect(centre.setActiveTab).toHaveBeenCalledExactlyOnceWith(1);

    const docked = revealFixture({ dock: 'left' });
    revealEditorFile(docked.port, 'edit');
    expect(docked.setActiveTab).not.toHaveBeenCalled();
    expect(docked.tabs[1]?.dock).toBe('left');
    expect(docked.state.expanded).toEqual(new Set(['src', 'src/deep']));
    expect(docked.state.restore?.cursor).toBe('src/deep/a.ts');
  });
});

describe('clearRevealFocus', () => {
  it('drops focus from a hint whose revision matches and keeps every other member', () => {
    const { state, port } = revealFixture();
    state.restore = {
      revision: 4, cursor: null, anchor: 'src/deep/a.ts', anchorToCursor: false, selected: null, focus: true,
    };

    clearRevealFocus(port, 'files', 4);

    expect(state.restore).toEqual({
      revision: 4, cursor: null, anchor: 'src/deep/a.ts', anchorToCursor: false, selected: null,
    });
    expect(state.restore).not.toHaveProperty('focus');
    expect(port.rebuild).toHaveBeenCalledExactlyOnceWith('files');
  });

  it('keeps a hint whose cursor and selection are absent free of those members', () => {
    const { state, port } = revealFixture();
    state.restore = { revision: 7, focus: true };

    clearRevealFocus(port, 'files', 7);

    expect(state.restore).toEqual({ revision: 7 });
    expect(state.restore).not.toHaveProperty('focus');
    expect(port.rebuild).toHaveBeenCalledExactlyOnceWith('files');
  });

  it('leaves the hint alone when the revision does not match', () => {
    const { state, port } = revealFixture();
    state.restore = { revision: 5, cursor: 'src/deep/a.ts', focus: true };

    clearRevealFocus(port, 'files', 4);

    expect(state.restore).toEqual({ revision: 5, cursor: 'src/deep/a.ts', focus: true });
    expect(port.rebuild).not.toHaveBeenCalled();
  });

  it('does nothing for a hint that carries no focus', () => {
    const { state, port } = revealFixture();
    state.restore = { revision: 4, cursor: 'src/deep/a.ts' };

    clearRevealFocus(port, 'files', 4);

    expect(state.restore).toEqual({ revision: 4, cursor: 'src/deep/a.ts' });
    expect(port.rebuild).not.toHaveBeenCalled();
  });

  it('does nothing when the navigator holds no hint', () => {
    const { state, port } = revealFixture();

    clearRevealFocus(port, 'files', 4);

    expect(state.restore).toBeUndefined();
    expect(port.rebuild).not.toHaveBeenCalled();
  });

  it('does nothing for a label with no navigator state', () => {
    const { port } = revealFixture();

    clearRevealFocus(port, 'gone', 4);

    expect(port.states.has('gone')).toBe(false);
    expect(port.rebuild).not.toHaveBeenCalled();
  });
});

const remoteWorkspace = '/remote/ws';

function remoteFixture(options: {
  root?: string;
  remoteRoot?: string;
  recordRoot?: string;
  relPath?: string;
  label?: string;
  expanded?: string[];
} = {}) {
  const filesystem = { dispose: vi.fn() } as unknown as FileSystemPort;
  const file = cachedFile({
    root: options.recordRoot,
    relPath: options.relPath,
    label: options.label,
    filesystem,
  });
  const state = freshFileNavigatorState(
    options.root ?? remoteWorkspace, filesystem, 'name', { host: 'devbox', address: 'devbox' }, 'shell',
  );
  state.remoteRoot = options.remoteRoot ?? remoteWorkspace;
  const expanded = options.expanded ?? [];
  for (const relPath of expanded) state.expanded.add(relPath);
  const tabs: Record<string, unknown>[] = [
    {
      label: 'edit',
      view: 'editor',
      editor: { name: path.basename(file), path: file, size: '1 B', url: '/open/1' },
    },
    { label: 'files' },
  ];
  const openFilesTab = vi.fn();
  const setActiveTab = vi.fn();
  const port = {
    states: new Map([['files', state]]),
    managers: {
      tab: {
        launchDir: process.cwd(),
        tabs,
        byLabel: (label: string) => tabs.find((tab) => tab.label === label),
        mostRecentFileNavigatorLabel: () => 'files',
        findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
        openFilesTab,
        cur: () => tabs.at(-1),
        setCwd: vi.fn(),
        setActiveTab,
        setDock: vi.fn(),
      },
    },
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    rebuild: vi.fn(),
    refreshGit: vi.fn(),
    reportFailure: vi.fn(),
    setCwd: vi.fn(),
    hasTab: () => true,
  } as unknown as RevealPort;
  return { file, state, port, openFilesTab, setActiveTab };
}

describe('revealEditorFile for a remote cached file', () => {
  it('reveals it in the navigator named by its record without retargeting anything', () => {
    const { file, state, port, openFilesTab, setActiveTab } = remoteFixture({ relPath: 'src/notes.txt' });
    const before = nextRestoreRevision();

    revealEditorFile(port, 'edit');

    expect(state.root).toBe(remoteWorkspace);
    expect(state.expanded).toEqual(new Set(['src']));
    expect(state.restore).toMatchObject({
      cursor: 'src/notes.txt',
      anchor: 'src/notes.txt',
      selected: ['src/notes.txt'],
    });
    expect(state.restore?.revision).toBeGreaterThan(before);
    expect(port.refreshGit).not.toHaveBeenCalled();
    expect(openFilesTab).not.toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledExactlyOnceWith(1);
    expect(remoteFileFor(file)).toBeDefined();
  });

  it('reveals in the current root when the navigator re-rooted to an ancestor of the record root', () => {
    const { state, port, openFilesTab } = remoteFixture({
      root: '/remote/ws', recordRoot: '/remote/ws/clone', relPath: 'src/a.ts', expanded: ['clone'],
    });
    const before = nextRestoreRevision();

    revealEditorFile(port, 'edit');

    expect(state.root).toBe('/remote/ws');
    expect(state.expanded).toEqual(new Set(['clone', 'clone/src']));
    expect(state.restore).toMatchObject({
      cursor: 'clone/src/a.ts',
      anchor: 'clone/src/a.ts',
      selected: ['clone/src/a.ts'],
    });
    expect(state.restore?.revision).toBeGreaterThan(before);
    expect(port.refreshGit).not.toHaveBeenCalled();
    expect(port.setCwd).not.toHaveBeenCalled();
    expect(openFilesTab).not.toHaveBeenCalled();
  });

  it('re-roots to the workspace root when the file is outside the navigator current root', () => {
    const { file, state, port } = remoteFixture({
      root: '/remote/ws/other', recordRoot: '/remote/ws/app', relPath: 'src/a.ts', expanded: ['lib', 'lib/deep'],
    });

    revealEditorFile(port, 'edit');

    expect(state.root).toBe(remoteWorkspace);
    expect(state.expanded).toEqual(new Set(['app', 'app/src']));
    expect(state.restore).toMatchObject({
      cursor: 'app/src/a.ts',
      anchor: 'app/src/a.ts',
      selected: ['app/src/a.ts'],
    });
    expect(port.setCwd).toHaveBeenCalledExactlyOnceWith('files', remoteWorkspace);
    expect(port.refreshGit).toHaveBeenCalledExactlyOnceWith('files');
    expect(port.unwatchDir).toHaveBeenCalledWith(state, 'lib');
    expect(port.unwatchDir).toHaveBeenCalledWith(state, 'lib/deep');
    expect(port.unwatchDir).toHaveBeenCalledWith(state, '');
    expect(state.expanded.has('lib')).toBe(false);
    expect(remoteFileFor(file)).toBeDefined();
  });

  it('changes nothing when the record names no navigator state', () => {
    const { state, port, openFilesTab, setActiveTab } = remoteFixture({ label: 'diff' });

    revealEditorFile(port, 'edit');

    expect(state.root).toBe(remoteWorkspace);
    expect(state.expanded.size).toBe(0);
    expect(state.restore).toBeUndefined();
    expect(port.rebuild).not.toHaveBeenCalled();
    expect(openFilesTab).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('changes nothing when the record is outside the navigator workspace root', () => {
    const { state, port, openFilesTab, setActiveTab } = remoteFixture({
      root: '/remote/ws/other', remoteRoot: '/remote/ws/other', recordRoot: '/remote/ws/app', relPath: 'notes.txt',
    });

    revealEditorFile(port, 'edit');

    expect(state.root).toBe('/remote/ws/other');
    expect(state.expanded.size).toBe(0);
    expect(state.restore).toBeUndefined();
    expect(port.rebuild).not.toHaveBeenCalled();
    expect(port.refreshGit).not.toHaveBeenCalled();
    expect(openFilesTab).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
