import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { OpenFileManager } from './open-file-manager.js';
import type { Managers } from './managers.js';
import { TabPluginHost } from './plugins/host.js';
import { openerForExtension } from './openers/index.js';

const osOpen = vi.hoisted(() => ({ didOsOpen: vi.fn<(file: string, application?: string) => boolean>(() => true) }));

vi.mock('./config.js', () => ({
  getConfig: () => ({ syncPaths: ['synced/'], externalViewers: { video: 'QuickTime Player' } }),
}));
vi.mock('./openers/os-open.js', () => ({ didOsOpen: osOpen.didOsOpen }));

describe('OpenFileManager.edit', () => {
  it('opens the editor for a new file that does not exist on disk', () => {
    const appended: string[] = [];
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: (_label: string, _entry: unknown) => { appended.push(JSON.stringify(_entry)); },
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit newfile.txt', 'newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(path.resolve('/working', 'newfile.txt'));
    expect(appended).toHaveLength(0);
  });

  it('opens the editor for an absolute new file path', () => {
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit /tmp/newfile.txt', '/tmp/newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe('/tmp/newfile.txt');
  });

  it('forwards a target line through to the opened editor view', () => {
    const opened: { path: string; line?: number }[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string; line?: number }) => { opened.push(view); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit foo.txt:42', 'foo.txt', 'janus', 42);

    expect(opened).toHaveLength(1);
    expect(opened[0].line).toBe(42);
  });
});

describe('OpenFileManager.edit (dispatch by file type)', () => {
  const makeEditManagers = (opened: string[], runOpener: ReturnType<typeof vi.fn>) => ({
    tab: {
      cwdOf: () => '/working',
      append: () => {},
      openEditorTab: (view: { path: string }) => { opened.push(view.path); },
      registerFile: (p: string) => `/open/test-${p.length}`,
    },
    plugins: { runOpener },
  } as unknown as Managers);

  it('routes an image to the image plugin edit presentation instead of the text editor', () => {
    const opened: string[] = [];
    const runOpener = vi.fn();

    new OpenFileManager(makeEditManagers(opened, runOpener)).edit('edit photo.png', 'photo.png', 'janus');

    expect(opened).toHaveLength(0);
    expect(runOpener).toHaveBeenCalledWith(
      'image', 'edit', path.resolve('/working', 'photo.png'), { label: 'janus', command: 'edit photo.png' },
    );
  });

  // The line number still parses for any file; the image editor simply has no use for one.
  it('opens the image editor for a path carrying a line suffix and discards the line', () => {
    const opened: string[] = [];
    const runOpener = vi.fn();

    new OpenFileManager(makeEditManagers(opened, runOpener))
      .edit('edit photo.png:42', 'photo.png', 'janus', 42);

    expect(runOpener).toHaveBeenCalledWith(
      'image', 'edit', path.resolve('/working', 'photo.png'),
      { label: 'janus', command: 'edit photo.png:42' },
    );
  });

  it.each([
    ['a source file', 'src/index.ts'],
    ['an extensionless file', 'Makefile'],
    ['a markdown file', 'readme.md'],
  ])('still reaches the plain-text editor for %s', (_label, target) => {
    const opened: string[] = [];
    const runOpener = vi.fn();

    new OpenFileManager(makeEditManagers(opened, runOpener)).edit(`edit ${target}`, target, 'janus');

    expect(runOpener).not.toHaveBeenCalled();
    expect(opened).toEqual([path.resolve('/working', target)]);
  });

  // Resolution reads the opener registry, which is built from declarations alone — asking whether a
  // plugin owns the verb must never be what activates it. Running the presentation is what does.
  it('resolves the claim from the registry without activating the plugin', () => {
    const managers = { tab: {} } as unknown as Managers;
    const host = new TabPluginHost(managers);

    expect(openerForExtension('.png')?.editsOwnFiles).toBe(true);
    expect(openerForExtension('.ts')?.editsOwnFiles).toBeUndefined();
    expect(host.statusFor('image')?.state).toBe('declared');
  });
});

describe('OpenFileManager.newFile', () => {
  const makeManagers = (dir: string, opened: string[]): Managers => ({
    tab: {
      cwdOf: () => dir,
      append: () => {},
      openEditorTab: (view: { path: string }) => { opened.push(view.path); },
      registerFile: vi.fn((p: string) => `/open/test-${p.length}`),
    },
  } as unknown as Managers);

  it('opens the literal target when it does not exist yet', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled.md')]);
  });

  it('opens untitled-2.md when untitled.md already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-2.md')]);
  });

  it('opens untitled-3.md when both untitled.md and untitled-2.md already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    writeFileSync(path.join(dir, 'untitled-2.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-3.md')]);
  });
});

describe('OpenFileManager.newDirectory', () => {
  const makeManager = (dir: string) => new OpenFileManager({
    tab: { cwdOf: () => dir },
  } as unknown as Managers);

  it('creates the requested directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled'))).toBe(true);
  });

  it('creates inside a nested target directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'src'));
    const manager = makeManager(dir);

    manager.newDirectory('src/untitled', 'janus');

    expect(existsSync(path.join(dir, 'src', 'untitled'))).toBe(true);
  });

  it('uses the next free suffix when directories already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'untitled'));
    mkdirSync(path.join(dir, 'untitled-2'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled-3'))).toBe(true);
  });
});

describe('OpenFileManager.run', () => {
  it('routes a markdown file inline to the markdown plugin opener', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-run-'));
    writeFileSync(path.join(dir, 'readme.md'), '# Hello', 'utf8');
    const runOpener = vi.fn();
    const managers = {
      tab: {
        cwdOf: () => dir,
        launchDir: dir,
        append: () => {},
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
      plugins: { runOpener },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    await mgr.run('open readme.md', 'janus');

    expect(runOpener).toHaveBeenCalledWith(
      'markdown', 'inline', path.join(dir, 'readme.md'), { label: 'janus', command: 'open readme.md' },
    );
  });

  // A plugin's declared command reaches the same pipeline as `open`, but pinned to its own opener.
  // Without that pin, `video notes.txt` would quietly open the plain-text editor.
  it('refuses a file that resolves to a different opener when one is required', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-require-'));
    writeFileSync(path.join(dir, 'notes.txt'), 'text');
    const notes: { input: string; output: string }[] = [];
    const runOpener = vi.fn();
    const managers = {
      tab: {
        cwdOf: () => dir, launchDir: dir, registerFile: vi.fn(),
        append: (_label: string, entry: { input: string; output: string }) => { notes.push(entry); },
      },
      plugins: { runOpener },
    } as unknown as Managers;

    await new OpenFileManager(managers).runAs('open notes.txt', 'video notes.txt', 'janus', 'video');

    expect(runOpener).not.toHaveBeenCalled();
    expect(notes).toEqual([{
      input: 'video notes.txt', output: `video: ${path.join(dir, 'notes.txt')}: not a video file`,
    }]);
  });

  // The web branch resolves ahead of the opener registry, so the pin has to be applied before it.
  // Both a URL scheme and a bare `page` keyword route there — `video page notes.txt` used to open a
  // browser tab pointed at `https://notes.txt/`.
  it.each([
    ['video https://example.com', 'open https://example.com', 'https://example.com'],
    ['video page notes.txt', 'open page notes.txt', 'notes.txt'],
  ])('refuses %s rather than routing it to the web claimant', async (display, parsed, target) => {
    const notes: { input: string; output: string }[] = [];
    const runOpener = vi.fn();
    const managers = {
      tab: {
        cwdOf: () => '/tmp', launchDir: '/tmp', registerFile: vi.fn(),
        append: (_label: string, entry: { input: string; output: string }) => { notes.push(entry); },
      },
      plugins: { runOpener },
    } as unknown as Managers;

    await new OpenFileManager(managers).runAs(parsed, display, 'janus', 'video');

    expect(runOpener).not.toHaveBeenCalled();
    expect(notes).toEqual([{ input: display, output: `video: ${target}: not a video file` }]);
  });

  // A web address has no extension to resolve an opener by, so it goes straight to whichever plugin
  // claimed the kind — verbatim, since normalizing one is the claimant's job, not the dispatcher's.
  it.each([
    ['open https://example.com', 'inline', 'https://example.com'],
    ['open page example.com', 'inline', 'example.com'],
    ['open external https://example.com', 'external', 'https://example.com'],
  ])('routes %s to the web claimant', async (command, presentation, target) => {
    const runOpener = vi.fn();
    const managers = {
      tab: { cwdOf: () => '/tmp', launchDir: '/tmp', registerFile: vi.fn(), append: vi.fn() },
      plugins: { runOpener },
    } as unknown as Managers;

    await new OpenFileManager(managers).run(command, 'janus');

    expect(runOpener).toHaveBeenCalledWith('page', presentation, target, { label: 'janus', command });
  });

  it('awaits async plugin openers in sorted order across a glob', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-run-'));
    for (const name of ['c.mp4', 'a.mp4', 'b.mp4']) writeFileSync(path.join(dir, name), 'video');
    const order: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => dir, launchDir: dir, append: vi.fn(), registerFile: vi.fn(),
      },
      plugins: {
        runOpener: vi.fn(async (_id: string, _mode: string, file: string) => {
          order.push(`start:${path.basename(file)}`);
          await Promise.resolve();
          order.push(`end:${path.basename(file)}`);
        }),
      },
    } as unknown as Managers;

    await new OpenFileManager(managers).run('open *.mp4', 'janus');

    expect(order).toEqual([
      'start:a.mp4', 'end:a.mp4',
      'start:b.mp4', 'end:b.mp4',
      'start:c.mp4', 'end:c.mp4',
    ]);
  });
});

describe('OpenFileManager.run (video)', () => {
  type Note = { input: string; output: string };

  const makeVideoManagers = (dir: string, opened: { path: string; player: string }[], notes: Note[]) => {
    const managers = {
      tab: {
        tabs: [{ label: 'janus' }],
        cwdOf: () => dir,
        launchDir: dir,
        append: (_label: string, entry: Note) => { notes.push(entry); },
        registerFile: (file: string) => `/open/test-${file.length}`,
        openPluginTab: (
          _id: string, _prefix: string, _key: string, _schema: number, _source: string,
          factory: (resources: { registerFile(file: string): string }) => { payload: unknown },
        ) => {
          const created = factory({ registerFile: (file) => `/open/test-${file.length}` });
          opened.push(created.payload as { path: string; player: string });
        },
      },
    } as unknown as Managers;
    managers.plugins = new TabPluginHost(managers);
    return managers;
  };

  beforeEach(() => {
    osOpen.didOsOpen.mockReset();
    osOpen.didOsOpen.mockReturnValue(true);
  });

  it('opens a playable video inline in a generic plugin tab', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(10));
    const opened: { path: string; player: string }[] = [];
    const mgr = new OpenFileManager(makeVideoManagers(dir, opened, []));

    await mgr.run('open clip.mp4', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0].path).toBe(path.join(dir, 'clip.mp4'));
    expect(opened[0].player).toBe('QuickTime Player');
    expect(osOpen.didOsOpen).not.toHaveBeenCalled();
  });

  it('hands a video to the configured player on `open external`, opening no tab', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(10));
    const opened: { path: string; player: string }[] = [];
    const notes: Note[] = [];
    const mgr = new OpenFileManager(makeVideoManagers(dir, opened, notes));

    await mgr.run('open external clip.mp4', 'janus');

    expect(opened).toHaveLength(0);
    expect(osOpen.didOsOpen).toHaveBeenCalledWith(path.join(dir, 'clip.mp4'), 'QuickTime Player');
    expect(notes[0].output).toBe('Opening clip.mp4 in QuickTime Player…');
  });

  it('reports no such file for a missing video', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    const opened: { path: string; player: string }[] = [];
    const notes: Note[] = [];
    const mgr = new OpenFileManager(makeVideoManagers(dir, opened, notes));

    mgr.run('open missing.mp4', 'janus');

    expect(opened).toHaveLength(0);
    expect(notes[0].output).toContain('no such file');
  });
});

describe('OpenFileManager.edit (synced path)', () => {
  type EditorTab = { label: string; editor?: { path: string; size: string; url: string; sync?: string } };

  const makeSyncedManagers = (dir: string, tabs: EditorTab[], openSync: () => Promise<{ dir: string } | { error: string }>) => ({
    tab: {
      cwdOf: () => dir,
      launchDir: dir,
      append: () => {},
      openEditorTab: (view: { name: string; path: string; size: string; url: string; sync?: string }) => {
        tabs.push({ label: 'janus', editor: view });
      },
      registerFile: vi.fn((p: string) => `/open/test-${p.length}`),
      tabs,
    },
    gitSync: {
      workspaceFilePath: (relative: string) => path.join('/workspace', relative),
      openSync,
    },
    editorWatch: {
      watch: vi.fn(),
    },
  } as unknown as Managers);

  it('marks the tab synced once the workspace pull succeeds', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-synced-'));
    mkdirSync(path.join(dir, 'synced'));
    writeFileSync(path.join(dir, 'synced', 'foo.md'), 'hello', 'utf8');
    const tabs: EditorTab[] = [];
    const managers = makeSyncedManagers(dir, tabs, async () => ({ dir: '/workspace' }));
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit synced/foo.md', 'synced/foo.md', 'janus');

    expect(tabs).toHaveLength(1);
    expect(tabs[0].editor?.sync).toBe('provisioning');
    const placeholderUrl = tabs[0].editor?.url;

    await vi.waitFor(() => expect(tabs[0].editor?.sync).toBe('synced'));

    expect(tabs[0].editor?.url).toBe(placeholderUrl);
    expect(managers.tab.registerFile).toHaveBeenCalledOnce();
    expect(managers.editorWatch.watch).toHaveBeenCalledWith('janus', path.join('/workspace', 'synced/foo.md'));
  });

  it('marks the tab errored when the workspace pull fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-synced-'));
    mkdirSync(path.join(dir, 'synced'));
    writeFileSync(path.join(dir, 'synced', 'foo.md'), 'hello', 'utf8');
    const tabs: EditorTab[] = [];
    const managers = makeSyncedManagers(dir, tabs, async () => ({ error: 'clone failed' }));
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit synced/foo.md', 'synced/foo.md', 'janus');

    await vi.waitFor(() => expect(tabs[0].editor?.sync).toBe('error'));

    expect(managers.editorWatch.watch).not.toHaveBeenCalled();
  });
});
