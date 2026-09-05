import { vi } from 'vitest';
import { HarnessManager } from './manager.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const browserMock = vi.hoisted(() => ({
  handles: [] as { close: ReturnType<typeof vi.fn> }[],
  onGone: [] as ((message: string) => void)[],
}));
const notificationMock = vi.hoisted(() => vi.fn());

vi.mock('./scratch-dir.js', () => ({
  claudeTmpDir: vi.fn((cwd: string) => `${cwd}/.janissary/temp`),
  harnessEnv: vi.fn((name: string, cwd: string) => (name === 'claude'
    ? { CLAUDE_CODE_TMPDIR: `${cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
    : undefined)),
  harnessSpawnEnv: vi.fn((options: {
    name: string; cwd: string; browser: boolean; onBrowserGone: (message: string) => void;
  }) => {
    const base = options.name === 'claude'
      ? { CLAUDE_CODE_TMPDIR: `${options.cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
      : undefined;
    if (!options.browser) return { env: base };
    browserMock.onGone.push(options.onBrowserGone);
    const handle = { close: vi.fn() };
    browserMock.handles.push(handle);
    return {
      env: {
        ...base,
        JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:50000/tok',
        JANISSARY_PLAYWRIGHT: '/pw/index.js',
      },
      handle,
    };
  }),
}));
vi.mock('../notifications.js', () => ({ notify: notificationMock }));
vi.mock('./recorder.js', () => ({
  HarnessRecorder: vi.fn(function () { return { dispose: vi.fn() }; }),
}));
vi.mock('./transcript/tailer.js', () => ({
  HarnessTranscriptTailer: vi.fn(function () {
    return { dispose: vi.fn(), transcriptFile: vi.fn(), entriesAfter: vi.fn(() => []) };
  }),
}));

export function createHarnessManager(managers: Managers): HarnessManager {
  return new HarnessManager(managers);
}

export function harnessBrowserMocks() {
  return browserMock;
}

export function browserNotificationMock() {
  return notificationMock;
}

export function resetHarnessBrowserFixture(): void {
  browserMock.handles.length = 0;
  browserMock.onGone.length = 0;
  vi.clearAllMocks();
}

export function makeBrowserManagers(): { managers: Managers; tabs: Tab[] } {
  const tabs = [{ label: 'janus', log: [] } as unknown as Tab];
  const creator = tabs[0];
  const busy = new Set<string>();
  const managers = {
    tab: {
      tabs,
      cur: () => creator,
      cwdOf: () => '/project',
      setCwd: () => {},
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      isBusy: (label: string) => busy.has(label),
      addBusy: vi.fn((label: string) => { busy.add(label); }),
      deleteBusy: vi.fn((label: string) => { busy.delete(label); }),
      markUnread: vi.fn(),
      findIndex: () => tabs.length - 1,
      setActiveTab: vi.fn((index: number) => { managers.tab.activeTab = index; }),
      append: vi.fn(),
      activeTab: 0,
      closeTab: vi.fn((index: number) => { tabs.splice(index, 1); }),
    },
    pty: {
      spawn: vi.fn(() => 'pty-1'),
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      input: vi.fn(),
    },
    workspace: { create: () => ({ dir: '/workspace/claude' }) },
    openFile: { edit: vi.fn() },
    schedule: { set: vi.fn() },
  } as unknown as Managers;
  return { managers, tabs };
}
