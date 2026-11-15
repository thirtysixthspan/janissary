import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EditorView } from '../tab/types.js';
import type { FileSystemPort } from './filesystem-port.js';
import {
  clearRemoteFileCache, forgetRemoteFilesOf, initRemoteFileCache, materializeRemoteFile,
} from './remote/file-cache.js';
import { editorRevealBlocked, revealTargetFor } from './reveal-editor.js';

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
