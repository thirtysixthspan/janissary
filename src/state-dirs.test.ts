import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  initAgentStateDirectory: vi.fn(),
  clearStateDirectory: vi.fn(),
  initHarnessCaptureDirectory: vi.fn(),
  clearCaptureDirectory: vi.fn(),
  initHarnessRecordingDirectory: vi.fn(),
  clearHarnessRecordingDirectory: vi.fn(),
  initHarnessTranscriptDirectory: vi.fn(),
  clearHarnessTranscriptDirectory: vi.fn(),
  initBrowserLogDirectory: vi.fn(),
  clearBrowserLogDirectory: vi.fn(),
  initGlobalHistory: vi.fn(),
  initDbDir: vi.fn(),
  initProfileDir: vi.fn(),
  initWorkspaceDir: vi.fn(),
  clearWorkspaceDir: vi.fn(),
  initRemoteFileCache: vi.fn(),
  clearRemoteFileCache: vi.fn(),
}));

vi.mock('./agent/state.js', () => ({
  initAgentStateDirectory: mocks.initAgentStateDirectory,
  clearStateDirectory: mocks.clearStateDirectory,
}));
vi.mock('./harness/capture-file.js', () => ({
  initHarnessCaptureDirectory: mocks.initHarnessCaptureDirectory,
  clearCaptureDirectory: mocks.clearCaptureDirectory,
}));
vi.mock('./harness/recording-file.js', () => ({
  initHarnessRecordingDirectory: mocks.initHarnessRecordingDirectory,
  clearHarnessRecordingDirectory: mocks.clearHarnessRecordingDirectory,
}));
vi.mock('./harness/transcript-file.js', () => ({
  initHarnessTranscriptDirectory: mocks.initHarnessTranscriptDirectory,
  clearHarnessTranscriptDirectory: mocks.clearHarnessTranscriptDirectory,
}));
vi.mock('./browser/browser-log.js', () => ({
  initBrowserLogDirectory: mocks.initBrowserLogDirectory,
  clearBrowserLogDirectory: mocks.clearBrowserLogDirectory,
}));
vi.mock('./global-history.js', () => ({
  initGlobalHistory: mocks.initGlobalHistory,
}));
vi.mock('./connections.js', () => ({
  initDbDir: mocks.initDbDir,
}));
vi.mock('./profiles.js', () => ({
  initProfileDir: mocks.initProfileDir,
}));
vi.mock('./workspace/index.js', () => ({
  initWorkspaceDir: mocks.initWorkspaceDir,
  clearWorkspaceDir: mocks.clearWorkspaceDir,
}));
vi.mock('./file-navigator/remote-file-cache.js', () => ({
  initRemoteFileCache: mocks.initRemoteFileCache,
  clearRemoteFileCache: mocks.clearRemoteFileCache,
}));
vi.mock('./transcript/logger.js', () => ({
  TranscriptLogger: vi.fn(),
}));
vi.mock('./transcript/store.js', () => ({
  TranscriptStore: Object.assign(vi.fn(), { clear: vi.fn() }),
}));

import {
  initStateDirectories, clearStateDirectories,
  STATE_DIRECTORY_ENTRIES, STATE_DIRECTORY_ORDER_IS_COMPLETE,
} from './state-dirs.js';
import * as loggerModule from './transcript/logger.js';
import * as storeModule from './transcript/store.js';

const OPTIONS = { projectDir: '/project', packageRoot: '/package-root' };

describe('initStateDirectories', () => {
  it('inits every registered subsystem in registry order', () => {
    initStateDirectories(OPTIONS);

    expect(mocks.initAgentStateDirectory).toHaveBeenCalledWith('/project');
    expect(mocks.initHarnessCaptureDirectory).toHaveBeenCalledWith('/project');
    expect(mocks.initHarnessRecordingDirectory).toHaveBeenCalledWith('/project');
    expect(mocks.initHarnessTranscriptDirectory).toHaveBeenCalledWith('/project');
    expect(mocks.initBrowserLogDirectory).toHaveBeenCalledWith('/project');
    expect(mocks.initGlobalHistory).not.toHaveBeenCalledWith('/project');
    expect(mocks.initDbDir).toHaveBeenCalledWith('/project');
    expect(mocks.initWorkspaceDir).toHaveBeenCalledWith('/project');
    expect(mocks.initRemoteFileCache).toHaveBeenCalledWith('/project');
    expect(loggerModule.TranscriptLogger).toHaveBeenCalledWith('/project');
    expect(storeModule.TranscriptStore as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('/project');
  });

  // The profiles init needs the package root; everything else only takes the project dir.
  it('passes the package root to the profiles init', () => {
    initStateDirectories(OPTIONS);

    expect(mocks.initProfileDir).toHaveBeenCalledWith('/project', '/package-root');
  });

  it('covers exactly the keys the registry is pinned against', () => {
    expect(STATE_DIRECTORY_ORDER_IS_COMPLETE).toBe(true);
    expect(STATE_DIRECTORY_ENTRIES).toHaveLength(12);
  });
});

describe('clearStateDirectories', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockClear();
    (storeModule.TranscriptStore.clear as ReturnType<typeof vi.fn>).mockClear();
  });

  it('clears every entry with a clear on a fresh start', () => {
    clearStateDirectories(false);

    expect(mocks.clearCaptureDirectory).toHaveBeenCalledOnce();
    expect(mocks.clearHarnessRecordingDirectory).toHaveBeenCalledOnce();
    expect(mocks.clearHarnessTranscriptDirectory).toHaveBeenCalledOnce();
    expect(mocks.clearBrowserLogDirectory).toHaveBeenCalledOnce();
    expect(mocks.clearWorkspaceDir).toHaveBeenCalledOnce();
    expect(storeModule.TranscriptStore.clear).toHaveBeenCalledOnce();
    expect(mocks.clearRemoteFileCache).toHaveBeenCalledOnce();
  });

  it('runs no per-subsystem clear on a relaunch except the always ones', () => {
    clearStateDirectories(true);

    expect(mocks.clearCaptureDirectory).not.toHaveBeenCalled();
    expect(mocks.clearHarnessRecordingDirectory).not.toHaveBeenCalled();
    expect(mocks.clearHarnessTranscriptDirectory).not.toHaveBeenCalled();
    expect(mocks.clearBrowserLogDirectory).not.toHaveBeenCalled();
    expect(mocks.clearWorkspaceDir).not.toHaveBeenCalled();
    expect(storeModule.TranscriptStore.clear).not.toHaveBeenCalled();
    expect(mocks.clearRemoteFileCache).toHaveBeenCalledOnce();
  });

  it('runs no init side effects', () => {
    clearStateDirectories(false);

    expect(mocks.initAgentStateDirectory).not.toHaveBeenCalled();
  });
});
