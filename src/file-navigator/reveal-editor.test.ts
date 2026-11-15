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
  clearRemoteFileCache, forgetRemoteFilesOf, initRemoteFileCache, materializeRemoteFile,
} from './remote/file-cache.js';
import { editorRevealBlocked, revealEditorFile, revealTargetFor, type RevealPort } from './reveal-editor.js';

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

function cachedFile(): string {
  project = mkdtempSync(path.join(tmpdir(), 'janus-reveal-editor-'));
  initRemoteFileCache(project);
  return materializeRemoteFile(
    { destination: 'devbox', workspaceRoot: '/remote/ws', workspaceLabel: 'claude' },
    'notes.txt', Buffer.from('x'),
    { filesystem: cacheFilesystem, root: '/remote/ws', relPath: 'notes.txt', label: 'files' },
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
  const setActiveTab = vi.fn();
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
  return { root, state, states, port, opened, setActiveTab };
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

  it('activates the navigator index in the centre strip and when it is docked', () => {
    const centre = revealFixture();
    revealEditorFile(centre.port, 'edit');
    expect(centre.setActiveTab).toHaveBeenCalledExactlyOnceWith(1);

    const docked = revealFixture({ dock: 'left' });
    revealEditorFile(docked.port, 'edit');
    expect(docked.setActiveTab).toHaveBeenCalledExactlyOnceWith(1);
  });
});
