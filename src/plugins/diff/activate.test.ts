import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { activate } from './activate.js';
import type { DiffPayload } from './shared.js';

// The host's own rule for a published payload, imported rather than copied: it is what refuses a
// tab whose payload carries a property whose value is `undefined`, which no guard notices.
import { isJsonCompatible } from '../context.js';

// The plugin under test, run against a real temporary repository: the change set it renders is
// git's answer, and only git gives that. The capabilities are fakes, the way the search plugin's
// activation test fakes them.

function makeCapabilities(overrides: Record<string, unknown> = {}) {
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn((_key: string, factory: () => { payload: unknown }) => factory());
  const openInEditor = vi.fn();
  const dispatchLineWithOutput = vi.fn(async () => ({ dispatched: true, output: '' }));
  const rejectRequest = vi.fn((reason: string) => { throw new Error(reason); });
  const reportFailure = vi.fn((reason: unknown) => { throw new Error(String(reason)); });
  const originTab = vi.fn(() => ({ label: 'shell', cwd: '', root: '', workspace: undefined as { dir: string } | undefined }));
  const readSettings = vi.fn(() => ({}) as Record<string, unknown>);
  const saveSettings = vi.fn(() => true);
  const capabilities = {
    openOrFocusTab, updateTab, openInEditor, dispatchLineWithOutput, rejectRequest, reportFailure, originTab,
    readSettings, saveSettings,
    ...overrides,
  };
  return {
    capabilities: capabilities as never, openOrFocusTab, updateTab, openInEditor, dispatchLineWithOutput, originTab, readSettings, saveSettings,
  };
}

const settledTab: DiffPayload = { root: '$root/', state: 'done', message: '', split: false, files: [] };

function lastPayload(updateTab: ReturnType<typeof vi.fn>): DiffPayload {
  const factory = updateTab.mock.calls.at(-1)?.[1] as (() => { payload: DiffPayload }) | undefined;
  if (factory === undefined) throw new Error('no tab update was published');
  return factory().payload;
}

const intent = (tab: DiffPayload, name: string, payload: unknown) =>
  ({ tab: 'diff', intent: name, payload, tabPayload: tab });

// A long enough rest for a recompute already in flight to finish, so a test that asserts nothing
// further is published is measuring a settled outcome rather than a slow one.
const rest = () => new Promise((resolve) => setTimeout(resolve, 250));

// A recompute runs real git processes, so a fixed wait races the suite's load. Wait for the publish
// that is newer than the one the test starts from, which is the recompute's result itself — a
// recompute publishes nothing while it runs, so the body never blinks between polls.
const settled = async (updateTab: ReturnType<typeof vi.fn>): Promise<DiffPayload> => {
  const before = updateTab.mock.calls.length;
  await vi.waitFor(() => { expect(updateTab.mock.calls.length).toBeGreaterThan(before); }, { timeout: 10_000, interval: 25 });
  return lastPayload(updateTab);
};

function initRepo(root: string): void {
  execSync('git init -b master', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

function commitAll(root: string): void {
  execSync('git add -A', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m init', { cwd: root, stdio: 'pipe' });
}

describe('diff plugin activation', () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'diff-activate-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo);
    initRepo(repo);
    writeFileSync(path.join(repo, 'a.txt'), 'one');
    commitAll(repo);
    writeFileSync(path.join(repo, 'a.txt'), 'two');
  });

  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('accepts a context intent, answers null immediately, and publishes expanded Git context', async () => {
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`);
    writeFileSync(path.join(repo, 'a.txt'), `${lines.join('\n')}\n`);
    commitAll(repo);
    lines[10] = 'changed above';
    lines[29] = 'changed';
    writeFileSync(path.join(repo, 'a.txt'), `${lines.join('\n')}\n`);
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    const initial = await settled(updateTab);
    expect(activation.intent(intent(initial, 'context', { path: 'a.txt' }), capabilities)).toBeNull();
    await vi.waitFor(() => { expect(lastPayload(updateTab).files[0].contextLines).toBe(23); });
    expect(lastPayload(updateTab).files[0].hunks[0].lines.length).toBeGreaterThan(initial.files[0].hunks[0].lines.length);
    activation.intent(intent(initial, 'context', { path: 'a.txt', fullFile: true }), capabilities);
    await vi.waitFor(() => { expect(lastPayload(updateTab).files[0].contextLines).toBe(1_000_000); });
    expect(lastPayload(updateTab).files[0].hunks[0].lines.filter((line) => line.kind !== 'removed')).toHaveLength(60);
    activation.intent(intent(initial, 'context', { path: 'a.txt', fullFile: false }), capabilities);
    await vi.waitFor(() => { expect(lastPayload(updateTab).files[0].contextLines).toBeUndefined(); });
    expect(lastPayload(updateTab).files[0].hunks[0].lines.length).toBe(initial.files[0].hunks[0].lines.length);
    const boundary = lastPayload(updateTab).files[0].contextBoundaries?.find((item) => item.position === 'between');
    expect(boundary).toBeTruthy();
    activation.intent(intent(initial, 'context', { path: 'a.txt', boundary: boundary!.id }), capabilities);
    await vi.waitFor(() => { expect(lastPayload(updateTab).files[0].hunks).toHaveLength(1); });
    expect(lastPayload(updateTab).files[0].contextBoundaries?.some((item) => item.id === boundary!.id)).toBe(false);
    activation.intent(intent(initial, 'refresh', {}), capabilities);
    await vi.waitFor(() => { expect(lastPayload(updateTab).files[0].contextBoundaries?.some((item) => item.id === boundary!.id)).toBe(false); });
    expect(isJsonCompatible(lastPayload(updateTab))).toBe(true);
    activation.dispose?.();
  });

  it('validates its own payload', () => {
    const activation = activate();
    expect(activation.isPayload({})).toBe(false);
    expect(activation.isPayload(settledTab)).toBe(true);
    expect(activation.isPayload({ ...settledTab, files: [{ path: 'a.txt' }] })).toBe(false);
  });

  it('refuses a file, having claimed no extensions', () => {
    const activation = activate();
    const { capabilities } = makeCapabilities();
    expect(() => activation.opener?.inline?.('a.txt', capabilities)).toThrow('diff opens no files');
  });

  it('opens the tab on the project root of the tab that ran the command', async () => {
    const { capabilities, openOrFocusTab, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    activate().command?.('', capabilities);
    await settled(updateTab);
    expect(openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(lastPayload(updateTab).files.map((file) => file.path)).toEqual(['a.txt']);
  });

  it('scopes to a path argument and abbreviates the root for the header', async () => {
    mkdirSync(path.join(repo, 'sub'));
    writeFileSync(path.join(repo, 'sub', 'inner.txt'), 'x');
    writeFileSync(path.join(repo, 'outer.txt'), 'y');
    execSync('git add -A', { cwd: repo, stdio: 'pipe' });
    execSync('git commit -m second', { cwd: repo, stdio: 'pipe' });
    writeFileSync(path.join(repo, 'sub', 'inner.txt'), 'changed');
    writeFileSync(path.join(repo, 'outer.txt'), 'changed');
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    activate().command?.('sub', capabilities);
    const payload = await settled(updateTab);
    expect(payload.files.map((file) => file.path)).toEqual(['inner.txt']);
    expect(payload.root).toBe('$root/sub');
  });

  it('rejects a path argument that escapes the project root', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    expect(() => activate().command?.('../elsewhere', capabilities)).toThrow('outside the project root');
    expect(openOrFocusTab).not.toHaveBeenCalled();
  });

  it('rejects a path argument that is not a directory there, as a typo rather than a non-repository', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    expect(() => activate().command?.('nosuchdir', capabilities)).toThrow('no such directory');
    expect(openOrFocusTab).not.toHaveBeenCalled();
  });

  it('rejects a path argument naming a file rather than a directory', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    expect(() => activate().command?.('a.txt', capabilities)).toThrow('no such directory');
    expect(openOrFocusTab).not.toHaveBeenCalled();
  });

  it('re-scopes the open tab rather than opening a second one', async () => {
    const origin = { label: 'shell', cwd: repo, root: repo, workspace: undefined };
    mkdirSync(path.join(repo, 'sub'));
    const { capabilities, openOrFocusTab, updateTab } = makeCapabilities({ originTab: vi.fn(() => origin) });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    activation.command?.('sub', capabilities);
    await settled(updateTab);
    expect(openOrFocusTab).toHaveBeenCalledTimes(2);
    expect(openOrFocusTab.mock.calls.every(([key]) => key === 'diff')).toBe(true);
    expect(lastPayload(updateTab).files.map((file) => file.path)).toEqual([]);
  });

  it('recomputes when the command is run again', async () => {
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    const published = updateTab.mock.calls.length;
    writeFileSync(path.join(repo, 'b.txt'), 'new');
    activation.command?.('', capabilities);
    await settled(updateTab);
    expect(updateTab.mock.calls.length).toBeGreaterThan(published);
    expect(lastPayload(updateTab).files.map((file) => file.path)).toEqual(['a.txt', 'b.txt']);
  });

  it('opens on the directory of the tab whose workspace button was pressed', async () => {
    const workspace = path.join(root, '.janissary', 'workspace', 'emrah');
    mkdirSync(workspace, { recursive: true });
    initRepo(workspace);
    writeFileSync(path.join(workspace, 'w.txt'), 'one');
    commitAll(workspace);
    writeFileSync(path.join(workspace, 'w.txt'), 'two');
    const { capabilities, openOrFocusTab, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: workspace, root: repo, workspace: { dir: workspace } })),
    });
    activate().openSibling?.(capabilities);
    const payload = await settled(updateTab);
    expect(openOrFocusTab).toHaveBeenCalledTimes(1);
    expect(payload.files.map((file) => file.path)).toEqual(['w.txt']);
    expect(payload.root).toBe('$workspace/emrah');
  });

  it('opens nothing for the workspace button on a tab with no workspace', () => {
    const { capabilities, openOrFocusTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    activate().openSibling?.(capabilities);
    expect(openOrFocusTab).not.toHaveBeenCalled();
  });

  it('answers not-repository for a directory outside a git repository', async () => {
    const bare = path.join(root, 'bare');
    mkdirSync(bare);
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: bare, root: bare, workspace: undefined })),
    });
    activate().command?.('', capabilities);
    const payload = await settled(updateTab);
    expect(payload.state).toBe('not-repository');
    expect(payload.files).toEqual([]);
  });

  it('opens a file at a line the diff produced', async () => {
    const { capabilities, updateTab, openInEditor } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    activation.intent(intent(settledTab, 'open', { path: 'a.txt', line: 1 }), capabilities);
    expect(openInEditor).toHaveBeenCalledWith(path.join(repo, 'a.txt'), 1);
  });

  it('opens nothing for a path that escapes the diffed root', async () => {
    const { capabilities, updateTab, openInEditor } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    activation.intent(intent(settledTab, 'open', { path: '../../../etc/passwd', line: 1 }), capabilities);
    expect(openInEditor).not.toHaveBeenCalled();
  });

  it('dispatches the open line the application already owns for a binary file', async () => {
    const { capabilities, updateTab, dispatchLineWithOutput } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    expect(activation.intent(intent(settledTab, 'open-media', { path: 'pic.png' }), capabilities)).toBeNull();
    expect(dispatchLineWithOutput).toHaveBeenCalledWith(`open ${path.join(repo, 'pic.png')}`);
  });

  it('refreshes with whitespace-only changes included', async () => {
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    writeFileSync(path.join(repo, 'a.txt'), 'one   ');
    activation.intent(intent(settledTab, 'refresh', {}), capabilities);
    await settled(updateTab);
    expect(lastPayload(updateTab).files.map((file) => file.path)).toEqual(['a.txt']);
  });

  it('answers null from a refresh intent rather than nothing at all', async () => {
    // The host validates an intent's result with `isJsonCompatible` and disables the plugin when it
    // fails, and a handler resolving to `undefined` fails it — which a recompute returned from an
    // async handler does. Assert the answer, not just that the recompute ran.
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    expect(activation.intent(intent(settledTab, 'refresh', {}), capabilities)).toBeNull();
  });

  it('publishes a payload the host accepts, untracked file included', async () => {
    // The host validates every published payload with `isJsonCompatible` and refuses the tab when it
    // fails. This is the check that catches an undefined-valued property, which no guard notices and
    // which a unit test with a hand-built payload never meets.
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    writeFileSync(path.join(repo, 'untracked.md'), 'new');
    activate().command?.('', capabilities);
    await settled(updateTab);
    const factory = updateTab.mock.calls.at(-1)?.[1] as () => { payload: unknown };
    expect(isJsonCompatible(factory().payload)).toBe(true);
  });

  it('answers an error state rather than throwing when a publish is refused', async () => {
    // The recompute runs outside the intent that asked for it, so a throw here would escape as an
    // unhandled rejection and take the process down, closing every tab rather than this one.
    const refusing = vi.fn(() => { throw new Error('produced an invalid tab payload'); });
    const { capabilities } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
      updateTab: refusing,
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await rest();
    const answered = activation.intent(intent(settledTab, 'refresh', {}), capabilities);
    expect(answered).toBeNull();
    await rest();
    expect(refusing).toHaveBeenCalled();
  });

  it('opens the tab in the layout its settings entry saved, and switches on the layout intent', async () => {
    // The requirement: the layout is a standing preference rather than a per-tab one, the way the
    // search tab opens with the view modes it last used. Assert both halves — the payload the tab
    // opens with carries the saved layout, and the intent changes it and saves the new one.
    const { capabilities, updateTab, saveSettings } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
      readSettings: vi.fn(() => ({ split: true })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    await settled(updateTab);
    expect(lastPayload(updateTab).split).toBe(true);
    activation.intent(intent(settledTab, 'layout', { split: false }), capabilities);
    expect(lastPayload(updateTab).split).toBe(false);
    expect(saveSettings).toHaveBeenCalledWith({ split: false });
  });

  it('writes the settings entry once for a layout it already saved', () => {
    const { capabilities, saveSettings } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
      readSettings: vi.fn(() => ({ split: true })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    activation.intent(intent(settledTab, 'layout', { split: true }), capabilities);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('rejects a layout intent whose payload is malformed', () => {
    const { capabilities } = makeCapabilities();
    expect(() => activate().intent(intent(settledTab, 'layout', {}), capabilities))
      .toThrow('invalid layout payload');
  });

  it('rejects an intent name the table does not declare', () => {
    const { capabilities } = makeCapabilities();
    expect(() => activate().intent(intent(settledTab, 'toString', {}), capabilities))
      .toThrow('unknown diff intent "toString"');
  });

  it('rejects a refresh intent whose payload is malformed', () => {
    const { capabilities } = makeCapabilities();
    expect(() => activate().intent(intent(settledTab, 'refresh', { hideWhitespace: true }), capabilities))
      .toThrow('invalid refresh payload');
  });

  it('publishes nothing while a recompute is in flight, so the body never blinks', async () => {
    // The symptom as reported: the once-a-second refresh published a loading payload first, and the
    // client's No changes message renders only while the state reads done, so the message unmounted
    // and remounted with every redraw. Assert the publish stays away, not just the final state.
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    const standing = await settled(updateTab);
    activation.intent(intent(settledTab, 'refresh', {}), capabilities);
    expect(lastPayload(updateTab)).toBe(standing);
    expect(lastPayload(updateTab).state).toBe('done');
    await settled(updateTab);
  });

  it('publishes nothing more from a recompute still in flight when disposed', async () => {
    const { capabilities, updateTab } = makeCapabilities({
      originTab: vi.fn(() => ({ label: 'shell', cwd: repo, root: repo, workspace: undefined })),
    });
    const activation = activate();
    activation.command?.('', capabilities);
    const published = updateTab.mock.calls.length;
    activation.dispose?.();
    await rest();
    expect(updateTab.mock.calls.length).toBe(published);
  });
});
