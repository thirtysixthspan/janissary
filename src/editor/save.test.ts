import { describe, it, expect, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveFile, LIVE_SHELL_TRANSCRIPT_SAVE_REASON } from './save.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import { EditorWatchManager } from './watch-manager.js';
import { contentHash, SAVE_CONFLICT_ERROR } from './save-conflict.js';
import { tabRuntime } from '../tab/runtime.js';
import { removeTabAt } from '../tab/reorder.js';

const { notify, writeGitFailureOutput } = vi.hoisted(() => ({
  notify: vi.fn(),
  writeGitFailureOutput: vi.fn((): string | undefined => undefined),
}));
vi.mock('../notifications/index.js', () => ({ notify }));
vi.mock('../git/failure-output.js', () => ({ writeGitFailureOutput }));

const notWriting = { isWriting: () => false } as unknown as Managers['shellTranscript'];

function setup(content = 'original') {
  const managers = {} as Managers;
  managers.shellTranscript = notWriting;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-'));
  const file = path.join(dir, 'notes.txt');
  writeFileSync(file, content);
  const url = managers.tab.registerFile(file);
  managers.tab.openEditorTab({ name: 'notes.txt', path: file, size: '8 B', url });
  return { managers, dir, file, url };
}

describe('saveFile', () => {
  it.skipIf(process.platform !== 'darwin')('continues observing external replacements, edits, and recreation', async () => {
    const { managers, dir, file, url } = setup();
    managers.editorWatch = new EditorWatchManager(managers);
    const tab = managers.tab.tabs.find((item) => item.editor)!;
    managers.editorWatch.watch(tab.label, file);
    try {
      for (const attempt of [1, 2]) {
        const previousMtime = tab.editor?.mtimeMs;
        saveFile(managers, url, `save ${attempt}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(tab.editor?.mtimeMs).toBe(previousMtime);

        const replacement = `${file}.external`;
        writeFileSync(replacement, `external replacement ${attempt}`);
        const later = new Date(Date.now() + attempt * 2000);
        utimesSync(replacement, later, later);
        renameSync(replacement, file);
        const externalMtime = statSync(file).mtimeMs;
        await vi.waitFor(() => expect(tab.editor?.mtimeMs).toBe(externalMtime), { timeout: 3000 });
      }

      writeFileSync(file, 'edit after replacements');
      const editTime = new Date(Date.now() + 6000);
      utimesSync(file, editTime, editTime);
      const editedMtime = statSync(file).mtimeMs;
      await vi.waitFor(() => expect(tab.editor?.mtimeMs).toBe(editedMtime), { timeout: 3000 });

      rmSync(file);
      writeFileSync(file, 'recreated after deletion');
      const recreatedTime = new Date(Date.now() + 8000);
      utimesSync(file, recreatedTime, recreatedTime);
      const recreatedMtime = statSync(file).mtimeMs;
      await vi.waitFor(() => expect(tab.editor?.mtimeMs).toBe(recreatedMtime), { timeout: 3000 });
    } finally {
      managers.editorWatch.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes through the open-file allow-list', () => {
    const { managers, file, url } = setup();
    saveFile(managers, url, 'updated content');
    expect(readFileSync(file, 'utf8')).toBe('updated content');
  });

  it('preserves the existing file permission bits', () => {
    const { managers, file, url } = setup();
    chmodSync(file, 0o640);

    saveFile(managers, url, 'updated content');

    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it('leaves no temporary sibling after a successful save', () => {
    const { managers, dir, url } = setup();

    saveFile(managers, url, 'updated content');

    expect(readdirSync(dir)).toEqual(['notes.txt']);
  });

  it('updates the owning tab displayed size after a save', () => {
    const { managers, url } = setup();
    saveFile(managers, url, 'x'.repeat(2048));
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.size).not.toBe('8 B');
    expect(tab?.editor?.size).toContain('2');
  });

  it('clears a pre-existing draft on a successful save', () => {
    const { managers, url } = setup();
    const tab = managers.tab.tabs.find((t) => t.editor);
    tab!.editorDraft = { content: 'draft', updatedAt: Date.now() };
    saveFile(managers, url, 'updated content');
    expect(tab?.editorDraft).toBeUndefined();
  });

  it('leaves a draft intact when the save fails', () => {
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
    const url = managers.tab.registerFile('/no/such/dir/notes.txt');
    managers.tab.openEditorTab({ name: 'notes.txt', path: '/no/such/dir/notes.txt', size: '0 B', url });
    const tab = managers.tab.tabs.find((t) => t.editor);
    tab!.editorDraft = { content: 'draft', updatedAt: Date.now() };
    expect(() => saveFile(managers, url, 'x')).toThrow();
    expect(tab?.editorDraft?.content).toBe('draft');
  });

  it('rejects an unknown file ref', () => {
    const { managers } = setup();
    expect(() => saveFile(managers, '/open/999', 'x')).toThrow(/unknown file ref/);
    expect(() => saveFile(managers, '/etc/passwd', 'x')).toThrow(/unknown file ref/);
  });

  it('surfaces write errors', () => {
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    const url = managers.tab.registerFile('/no/such/dir/notes.txt');
    expect(() => saveFile(managers, url, 'x')).toThrow();
  });
});

describe('saveFile stale-buffer guard', () => {
  it('refuses to write over content the buffer never saw, and refreshes the tab\'s watcher', () => {
    const { managers, file, url } = setup('original');
    const refresh = vi.fn();
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh } as unknown as Managers['editorWatch'];
    writeFileSync(file, 'changed by a pull');

    expect(() => saveFile(managers, url, 'my edit', contentHash('original'))).toThrow(SAVE_CONFLICT_ERROR);

    expect(readFileSync(file, 'utf8')).toBe('changed by a pull');
    expect(refresh).toHaveBeenCalledWith(managers.tab.tabs.find((t) => t.editor)?.label);
  });

  it('writes when the file still holds the content the buffer last matched', () => {
    const { managers, file, url } = setup('original');
    saveFile(managers, url, 'my edit', contentHash('original'));
    expect(readFileSync(file, 'utf8')).toBe('my edit');
  });

  it('writes over a changed file when no expected hash is sent — the overwrite prompt\'s save', () => {
    const { managers, file, url } = setup('original');
    writeFileSync(file, 'changed by a pull');
    saveFile(managers, url, 'my edit');
    expect(readFileSync(file, 'utf8')).toBe('my edit');
  });

  it('matches a file with a byte-order mark against the text the browser read without it', () => {
    const { managers, file, url } = setup();
    writeFileSync(file, '\u{FEFF}original');
    saveFile(managers, url, 'my edit', contentHash('original'));
    expect(readFileSync(file, 'utf8')).toBe('my edit');
  });

  it('writes a file that no longer exists rather than refusing', () => {
    const { managers, file, url } = setup('original');
    rmSync(file);
    saveFile(managers, url, 'my edit', contentHash('original'));
    expect(readFileSync(file, 'utf8')).toBe('my edit');
  });
});

describe('saveFile live shell transcript guard', () => {
  function liveTranscript() {
    const opened = setup('% ls\nnotes.txt\n% ');
    const isWriting = vi.fn((filePath: string) => filePath === opened.file);
    opened.managers.shellTranscript = { isWriting } as unknown as Managers['shellTranscript'];
    notify.mockClear();
    return { ...opened, isWriting, label: opened.managers.tab.tabs.find((t) => t.editor)?.label };
  }

  it('refuses a save over a transcript still being written, notifying the tab and leaving its bytes untouched', () => {
    const { managers, file, url, isWriting, label } = liveTranscript();

    expect(() => saveFile(managers, url, 'tidied', contentHash('% ls\nnotes.txt\n% '))).toThrow(LIVE_SHELL_TRANSCRIPT_SAVE_REASON);

    expect(isWriting).toHaveBeenCalledWith(file);
    expect(readFileSync(file, 'utf8')).toBe('% ls\nnotes.txt\n% ');
    expect(notify).toHaveBeenCalledWith(managers, 'file-operation', label, LIVE_SHELL_TRANSCRIPT_SAVE_REASON);
  });

  it('refuses the overwrite prompt\'s save, which sends no expected hash, too', () => {
    const { managers, file, url } = liveTranscript();
    expect(() => saveFile(managers, url, 'tidied')).toThrow(LIVE_SHELL_TRANSCRIPT_SAVE_REASON);
    expect(readFileSync(file, 'utf8')).toBe('% ls\nnotes.txt\n% ');
  });

  it('refuses with its own reason rather than the stale-save conflict when new rows have landed', () => {
    const { managers, file, url } = liveTranscript();
    writeFileSync(file, '% ls\nnotes.txt\n% pwd\n');
    expect(() => saveFile(managers, url, 'tidied', contentHash('% ls\nnotes.txt\n% '))).toThrow(LIVE_SHELL_TRANSCRIPT_SAVE_REASON);
    expect(readFileSync(file, 'utf8')).toBe('% ls\nnotes.txt\n% pwd\n');
  });

  it('saves a transcript once nothing is writing it any more', () => {
    const { managers, file, url, isWriting } = liveTranscript();
    isWriting.mockReturnValue(false);
    saveFile(managers, url, 'tidied');
    expect(readFileSync(file, 'utf8')).toBe('tidied');
  });
});

describe('saveFile git sync', () => {
  function setupSynced(saveSync: (filename: string) => Promise<{ ok: true } | { error: string }>) {
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
    managers.gitSync = { saveSync } as unknown as Managers['gitSync'];
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-sync-'));
    const file = path.join(dir, 'synced.txt');
    writeFileSync(file, 'original');
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name: 'synced.txt', path: file, size: '8 B', url, sync: 'synced' });
    return { managers, file, url };
  }

  it('writes and updates size synchronously even while the sync cycle is still pending', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    const { managers, file, url } = setupSynced(() => promise);

    saveFile(managers, url, 'updated content');

    expect(readFileSync(file, 'utf8')).toBe('updated content');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.size).not.toBe('8 B');
    expect(tab?.editor?.sync).toBe('syncing');

    resolve({ ok: true });
    await promise;
  });

  it('transitions sync from syncing to synced once the cycle resolves', async () => {
    const { managers, url } = setupSynced(() => Promise.resolve({ ok: true }));
    saveFile(managers, url, 'updated content');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.sync).toBe('syncing');

    await vi.waitFor(() => expect(tab?.editor?.sync).toBe('synced'));
  });

  it('passes the saved file\'s path to the sync cycle, so it commits that file alone', async () => {
    const saveSync = vi.fn().mockResolvedValue({ ok: true });
    const { managers, file, url } = setupSynced(saveSync);
    saveFile(managers, url, 'updated content');

    await vi.waitFor(() => expect(saveSync).toHaveBeenCalledWith(file));
  });

  it('transitions sync to error when the cycle rejects', async () => {
    const { managers, url } = setupSynced(() => Promise.resolve({ error: 'push failed' }));
    saveFile(managers, url, 'updated content');
    const tab = managers.tab.tabs.find((t) => t.editor);

    await vi.waitFor(() => expect(tab?.editor?.sync).toBe('error'));
  });

  it('reports a failed cycle in the notifications tab', async () => {
    notify.mockClear();
    const { managers, url } = setupSynced(() => Promise.resolve({ error: 'push rejected (non-fast-forward)' }));
    saveFile(managers, url, 'updated content');
    const label = managers.tab.tabs.find((t) => t.editor)?.label;

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(
      managers, 'file-operation', label, 'Could not sync synced.txt: push rejected (non-fast-forward)', { openFile: undefined },
    ));
  });

  it('reports only the first line of a multi-line failure, linking its full output', async () => {
    notify.mockClear();
    writeGitFailureOutput.mockReturnValueOnce('/project/.janissary/git-errors/synced.log');
    const error = 'Command failed: git push origin HEAD:master\nerror: failed to push some refs\n1:35PM INF no leaks found\n';
    const { managers, url } = setupSynced(() => Promise.resolve({ error }));
    saveFile(managers, url, 'updated content');
    const label = managers.tab.tabs.find((t) => t.editor)?.label;

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(
      managers, 'file-operation', label, 'Could not sync synced.txt: Command failed: git push origin HEAD:master',
      { openFile: '/project/.janissary/git-errors/synced.log' },
    ));
    expect(writeGitFailureOutput).toHaveBeenCalledWith(label, expect.any(Number), error);
  });

  it('lets only the latest delayed save update sync status or report its failure', async () => {
    const first = Promise.withResolvers<{ ok: true } | { error: string }>();
    const second = Promise.withResolvers<{ ok: true } | { error: string }>();
    const saveSync = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { managers, url } = setupSynced(saveSync);
    const tab = managers.tab.tabs.find((item) => item.editor)!;
    const refresh = vi.fn();
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh } as unknown as Managers['editorWatch'];
    notify.mockClear();

    saveFile(managers, url, 'first');
    saveFile(managers, url, 'second');
    first.resolve({ error: 'old failure' });
    await first.promise;
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(tab.editor?.sync).toBe('syncing');
    expect(notify).not.toHaveBeenCalled();

    second.resolve({ ok: true });
    await vi.waitFor(() => expect(tab.editor?.sync).toBe('synced'));
  });

  it('does not attribute a pending failure to a replacement editor with the same label', async () => {
    const pending = Promise.withResolvers<{ ok: true } | { error: string }>();
    const { managers, file, url } = setupSynced(() => pending.promise);
    const previous = managers.tab.tabs.find((item) => item.editor)!;
    const refresh = vi.fn();
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh } as unknown as Managers['editorWatch'];
    saveFile(managers, url, 'updated');
    tabRuntime(previous).closing = true;
    managers.tab.tabs = managers.tab.tabs.filter((item) => item !== previous);
    const replacementLabel = managers.tab.openEditorTab({
      name: 'synced.txt', path: file, size: '8 B', url: managers.tab.registerFile(file), sync: 'synced',
    });
    const replacement = managers.tab.editorTab(replacementLabel)!;
    notify.mockClear();

    pending.resolve({ error: 'old editor failure' });
    await pending.promise;
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith(replacementLabel));

    expect(replacement.editor?.sync).toBe('synced');
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps sync ownership when closing an unrelated tab copies the tab records', async () => {
    const pending = Promise.withResolvers<{ ok: true }>();
    const { managers, url } = setupSynced(() => pending.promise);
    const owner = managers.tab.tabs.find((item) => item.editor)!;
    managers.tab.openEditorTab({ name: 'other.txt', path: '/sync/other.txt', size: '1 B', url: managers.tab.registerFile('/sync/other.txt') });
    saveFile(managers, url, 'updated');
    managers.tab.tabs = removeTabAt(managers.tab.tabs, managers.tab.tabs.findIndex((item) => item.label === 'other.txt'));

    pending.resolve({ ok: true });
    await pending.promise;
    await vi.waitFor(() => expect(owner.editor?.sync).toBe('synced'));
  });

  it('re-checks every open synced tab once the cycle\'s pull has run, but no unsynced one', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    const { managers, url } = setupSynced(() => promise);
    const refresh = vi.fn();
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh } as unknown as Managers['editorWatch'];
    const other = managers.tab.openEditorTab({ name: 'other.md', path: '/sync/other.md', size: '1 B', url: managers.tab.registerFile('/sync/other.md'), sync: 'synced' });
    const plain = managers.tab.openEditorTab({ name: 'plain.md', path: '/plain.md', size: '1 B', url: managers.tab.registerFile('/plain.md') });
    const saved = managers.tab.tabs.find((t) => t.editor?.name === 'synced.txt')!.label;

    saveFile(managers, url, 'updated content');
    expect(refresh).not.toHaveBeenCalled();
    resolve({ ok: true });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledWith(saved);
    expect(refresh).toHaveBeenCalledWith(other);
    expect(refresh).not.toHaveBeenCalledWith(plain);
  });

  it('does not start a sync cycle for a tab with no sync field', () => {
    const saveSync = vi.fn();
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
    managers.gitSync = { saveSync } as unknown as Managers['gitSync'];
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-nosync-'));
    const file = path.join(dir, 'plain.txt');
    writeFileSync(file, 'original');
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name: 'plain.txt', path: file, size: '8 B', url });

    saveFile(managers, url, 'updated content');

    expect(saveSync).not.toHaveBeenCalled();
  });
});

describe('saveFile new-file auto-suffix', () => {
  function setupNewFile(dir: string, name = 'untitled.md') {
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
    const file = path.join(dir, name);
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name, path: file, size: 'unknown', url, newFile: true });
    return { managers, file, url };
  }

  it('writes untitled.md when there is no clash', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    const { managers, file, url } = setupNewFile(dir);
    saveFile(managers, url, 'hello');
    expect(readFileSync(file, 'utf8')).toBe('hello');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.path).toBe(file);
    expect(tab?.editor?.newFile).toBe(false);
  });

  it('auto-suffixes to untitled-2.md when untitled.md already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing');
    const { managers, url } = setupNewFile(dir);
    saveFile(managers, url, 'hello');
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.path).toBe(path.join(dir, 'untitled-2.md'));
    expect(tab?.editor?.name).toBe('untitled-2.md');
    expect(tab?.title).toBe('untitled-2.md');
    expect(readFileSync(path.join(dir, 'untitled-2.md'), 'utf8')).toBe('hello');
    expect(readFileSync(path.join(dir, 'untitled.md'), 'utf8')).toBe('existing');
    expect(tab?.editor?.newFile).toBe(false);
    expect(managers.tab.openFilePath(url.slice('/open/'.length))).toBeUndefined();
    expect(managers.tab.openFilePath(tab?.editor?.url.slice('/open/'.length) ?? '')).toBe(path.join(dir, 'untitled-2.md'));
    expect(() => saveFile(managers, url, 'overwritten')).toThrow('unknown file ref');
    expect(readFileSync(path.join(dir, 'untitled.md'), 'utf8')).toBe('existing');
  });

  it('a non-new-file editor still overwrites as before, even if the target already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-save-newfile-'));
    const file = path.join(dir, 'existing.txt');
    writeFileSync(file, 'original');
    const managers = {} as Managers;
    managers.shellTranscript = notWriting;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: () => {} } as unknown as Managers['editorWatch'];
    const url = managers.tab.registerFile(file);
    managers.tab.openEditorTab({ name: 'existing.txt', path: file, size: '8 B', url });
    saveFile(managers, url, 'updated');
    expect(readFileSync(file, 'utf8')).toBe('updated');
  });
});
