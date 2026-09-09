import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Tab } from '../tab/types.js';
import { FileNavigatorManager } from './manager.js';

// The pull button's whole reason for existing is that a git-driven replace may not reach the
// directory watchers, so the refresh cannot be tested against a mocked `git pull`: the mock changes
// nothing on disk and a watcher-driven rebuild would pass the test for the wrong reason. These cases
// run a real pull between two real clones of a real bare origin, with the watchers live.

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.email=tests@example.com', '-c', 'user.name=Tests',
    '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main',
    ...args,
  ], { cwd, encoding: 'utf8' });
}

describe('the pull button refreshes the whole tree', () => {
  let base: string;
  let author: string;
  let navRoot: string;
  let tabs: Tab[];
  let managers: unknown;
  let activeTab: number;

  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), 'file-navigator-pull-'));
    const origin = path.join(base, 'origin.git');
    author = path.join(base, 'author');
    navRoot = path.join(base, 'tree');
    mkdirSync(origin);
    git(origin, 'init', '--bare', '-b', 'main');
    git(base, 'clone', origin, 'author');
    mkdirSync(path.join(author, 'sub'));
    writeFileSync(path.join(author, 'kept.txt'), 'first');
    writeFileSync(path.join(author, 'sub', 'old.txt'), 'first');
    git(author, 'add', '-A');
    git(author, 'commit', '-m', 'initial');
    git(author, 'push', 'origin', 'main');
    git(base, 'clone', origin, 'tree');

    activeTab = 0;
    const janus: Tab = {
      label: 'janus', dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
      log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
    };
    tabs = [janus];
    managers = {
      tab: {
        get tabs() { return tabs; },
        byLabel: (label: string) => tabs.find((t) => t.label === label),
        editorTabByUrl: () => tabs.find((t) => t.editor),
        filesTabByRoot: (r: string) => tabs.find((t) => t.files?.root === r),
        cwdOf: () => navRoot,
        append: () => {},
        findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
        setActiveTab: () => {},
        setDock: () => {},
        cur: () => tabs[activeTab],
        mostRecentFileNavigatorLabel: () => tabs.find((t) => t.files)?.label,
        setCwd: () => {},
        openFilesTab: (view: { root: string; rows: unknown[] }) => {
          tabs = [...tabs, { ...janus, label: 'navigator', files: view as never }];
          activeTab = tabs.length - 1;
        },
        // The pull's own report notifies, and a notification opens the feed when none is open.
        openNotificationsTab: () => {
          tabs = [...tabs, { ...janus, label: 'notifications', view: 'notifications' }];
        },
        retargetEditorTab: () => {},
      },
    };
  });

  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  const navTab = () => tabs.find((t) => t.label === 'navigator')!;
  const rowPaths = () => navTab().files!.rows.map((row) => row.path);

  // One push carrying an addition and a removal at the tree root and inside an expanded directory.
  function pushSecondCommit(): void {
    rmSync(path.join(author, 'kept.txt'));
    rmSync(path.join(author, 'sub', 'old.txt'));
    writeFileSync(path.join(author, 'added.txt'), 'second');
    writeFileSync(path.join(author, 'sub', 'new.txt'), 'second');
    git(author, 'add', '-A');
    git(author, 'commit', '-m', 'second');
    git(author, 'push', 'origin', 'main');
  }

  it('shows what the pull added and drops what it removed, at the root and inside an expanded directory', async () => {
    const manager = new FileNavigatorManager(managers as never);
    manager.open('files', 'janus');
    manager.toggle('navigator', 'sub');
    expect(rowPaths()).toContain('sub/old.txt');
    pushSecondCommit();

    manager.pull('navigator');

    await vi.waitFor(() => { expect(navTab().files!.pull).toBe('pulled'); }, { timeout: 10_000 });
    expect(rowPaths()).toContain('added.txt');
    expect(rowPaths()).not.toContain('kept.txt');
    expect(rowPaths()).toContain('sub/new.txt');
    expect(rowPaths()).not.toContain('sub/old.txt');
    manager.dispose();
  }, 30_000);

  it('leaves the directories the user had expanded expanded', async () => {
    const manager = new FileNavigatorManager(managers as never);
    manager.open('files', 'janus');
    manager.toggle('navigator', 'sub');
    pushSecondCommit();

    manager.pull('navigator');

    await vi.waitFor(() => { expect(navTab().files!.pull).toBe('pulled'); }, { timeout: 10_000 });
    expect(navTab().files!.rows.find((row) => row.path === 'sub')?.expanded).toBe(true);
    manager.dispose();
  }, 30_000);
});
