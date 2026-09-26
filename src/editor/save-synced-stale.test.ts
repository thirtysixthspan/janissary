import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { EditorWatchManager } from './watch-manager.js';
import { contentHash, SAVE_CONFLICT_ERROR } from './save-conflict.js';

vi.mock('../project/tokens.js', () => ({ getProjectTokens: () => ({}) }));

const { GitSync } = await import('../git/sync.js');
const { saveFile } = await import('./save.js');

const RELATIVE = 'product/backlog/documentation.md';
const lines = (count: number, prefix: string) => Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join('\n') + '\n';
const BASE = lines(12, 'record');
const UPSTREAM = BASE + lines(117, 'merged record');

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function cloneInto(origin: string, dir: string): void {
  git(path.dirname(dir), 'clone', '-q', origin, dir);
  git(dir, 'config', 'user.email', 'test@test.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

function commitAndPush(dir: string, content: string, message: string): void {
  mkdirSync(path.dirname(path.join(dir, RELATIVE)), { recursive: true });
  writeFileSync(path.join(dir, RELATIVE), content);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  git(dir, 'push', '-q', 'origin', 'HEAD:master');
}

let root: string;
let origin: string;
let shared: string;
let upstream: string;
let managers: Managers;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-save-stale-'));
  origin = path.join(root, 'origin.git');
  shared = path.join(root, 'git-sync');
  upstream = path.join(root, 'upstream');
  git(root, 'init', '-q', '--bare', '-b', 'master', origin);
  cloneInto(origin, upstream);
  commitAndPush(upstream, BASE, 'seed');
  cloneInto(origin, shared);
  managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = new EditorWatchManager(managers);
  const workspace = { create: () => ({ dir: shared, ready: Promise.resolve() }), remove: vi.fn() };
  managers.gitSync = new GitSync(workspace as unknown as WorkspaceManager);
});

afterEach(() => {
  managers.editorWatch.dispose();
  rmSync(root, { recursive: true, force: true });
});

function openSyncedTab(): { url: string; file: string } {
  const file = path.join(shared, RELATIVE);
  const url = managers.tab.registerFile(file);
  const label = managers.tab.openEditorTab({ name: path.basename(file), path: file, size: '1 KB', url, sync: 'synced' });
  managers.editorWatch.watch(label, file);
  return { url, file };
}

const originContent = () => git(origin, 'show', `master:${RELATIVE}`);

describe('saving a git-synced editor tab', () => {
  it('refuses a stale buffer instead of committing it over upstream work the clone already pulled', async () => {
    const { url, file } = openSyncedTab();
    const buffer = BASE;
    commitAndPush(upstream, UPSTREAM, 'upstream records');
    await managers.gitSync.openSync();
    expect(readFileSync(file, 'utf8')).toBe(UPSTREAM);

    expect(() => saveFile(managers, url, buffer + 'local edit\n', contentHash(buffer))).toThrow(SAVE_CONFLICT_ERROR);

    expect(readFileSync(file, 'utf8')).toBe(UPSTREAM);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(originContent()).toBe(UPSTREAM);
  });

  it('commits and pushes only the saved file when the buffer matches what is on disk', async () => {
    const { url } = openSyncedTab();
    writeFileSync(path.join(shared, 'stray.txt'), 'not the user\'s save');

    saveFile(managers, url, BASE + 'local edit\n', contentHash(BASE));

    const tab = managers.tab.tabs.find((t) => t.editor);
    await vi.waitFor(() => expect(tab?.editor?.sync).toBe('synced'), { timeout: 5000 });
    expect(originContent()).toBe(BASE + 'local edit\n');
    expect(git(shared, 'show', '--name-only', '--format=%s', 'HEAD').trim().split('\n')).toEqual(['sync: documentation.md', '', RELATIVE]);
    expect(git(shared, 'status', '--porcelain')).toContain('?? stray.txt');
  });
});
