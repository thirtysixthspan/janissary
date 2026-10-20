import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { releasePluginRemoteResources, remoteCapabilities } from './remote-capabilities.js';

const port = vi.hoisted(() => ({
  search: vi.fn(),
  searchText: vi.fn(),
  statRows: vi.fn(),
  readFile: vi.fn(),
  changeSet: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../file-navigator/remote/port.js', () => ({
  RemoteFileSystemPort: vi.fn(function portFactory() { return port; }),
}));

const declaration = { id: 'search' } as never;

// A search tab `search1` that rides a remote workspace, plus a harness `shell1` that rides nothing.
function fakeManagers(options: { riding?: boolean } = {}): Managers {
  const riding = options.riding ?? true;
  const tabs = [{ label: 'search1', plugin: { id: 'search', instanceKey: 'scan-1' } }, { label: 'shell1' }];
  const channel = {};
  return {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      pluginTabByInstanceKey: (id: string, instanceKey: string) => tabs.find(
        (tab) => tab.plugin?.id === id && tab.plugin.instanceKey === instanceKey,
      ),
    },
    remote: {
      get: (label: string) => (riding && label === 'search1' ? channel : undefined),
      readyOf: () => Promise.resolve('/srv/work'),
      workspaceOf: () => '/srv/work',
      entryOf: (label: string) => (riding && label === 'search1'
        ? { address: { destination: 'devbox' }, workspaceDir: '/srv/work', workspaceLabel: 'remote' }
        : undefined),
    },
  } as unknown as Managers;
}

const capabilitiesFor = (managers: Managers, isEnabled = () => true) =>
  remoteCapabilities({ managers, originLabel: 'shell1', declaration, isEnabled });

describe('remote workspace file capabilities', () => {
  beforeEach(() => {
    port.search.mockResolvedValue(['src/a.ts', 'README.md']);
    port.searchText.mockResolvedValue([{ path: 'src/a.ts', line: 1, above: [], match: 'todo', start: 0, end: 4, below: [] }]);
    port.statRows.mockResolvedValue({ 'src/a.ts': { size: 5 } });
    port.readFile.mockResolvedValue(new TextEncoder().encode('hello'));
  });

  afterEach(() => {
    releasePluginRemoteResources();
    vi.clearAllMocks();
  });

  it('lists the files of the tab the instance key names, even when built for another origin tab', async () => {
    await expect(capabilitiesFor(fakeManagers()).remoteWorkspaceFileList('scan-1'))
      .resolves.toEqual({ root: '/srv/work', paths: ['src/a.ts', 'README.md'] });
    expect(port.search).toHaveBeenCalledWith('/srv/work');
  });

  it('reads a size-checked file as decoded text', async () => {
    await expect(capabilitiesFor(fakeManagers()).readRemoteWorkspaceFile('scan-1', 'src/a.ts', 100))
      .resolves.toBe('hello');
    expect(port.statRows).toHaveBeenCalledWith('/srv/work', ['src/a.ts']);
    expect(port.readFile).toHaveBeenCalledWith('/srv/work', 'src/a.ts');
  });

  it('runs a search on the remote workspace and returns only match rows', async () => {
    const request = { query: 'todo', include: 'src/**', exclude: '', regex: false, matchCase: false, wholeWord: false };
    await expect(capabilitiesFor(fakeManagers()).remoteWorkspaceSearch('scan-1', request))
      .resolves.toEqual([{ path: 'src/a.ts', line: 1, above: [], match: 'todo', start: 0, end: 4, below: [] }]);
    expect(port.searchText).toHaveBeenCalledWith('/srv/work', request);
    expect(port.readFile).not.toHaveBeenCalled();
  });

  it('answers null for a tab riding nothing and for an instance key with no open tab', async () => {
    const riding = capabilitiesFor(fakeManagers({ riding: false }));
    await expect(riding.remoteWorkspaceFileList('scan-1')).resolves.toBeNull();
    await expect(riding.readRemoteWorkspaceFile('scan-1', 'src/a.ts', 100)).resolves.toBeNull();
    await expect(riding.remoteWorkspaceSearch('scan-1', {
      query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
    })).resolves.toBeNull();
    const missing = capabilitiesFor(fakeManagers());
    await expect(missing.remoteWorkspaceFileList('scan-2')).resolves.toBeNull();
    await expect(missing.readRemoteWorkspaceFile('scan-2', 'src/a.ts', 100)).resolves.toBeNull();
    await expect(missing.remoteWorkspaceSearch('scan-2', {
      query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
    })).resolves.toBeNull();
  });

  it('answers null when the file is over the size limit or has no stat row', async () => {
    const capabilities = capabilitiesFor(fakeManagers());
    await expect(capabilities.readRemoteWorkspaceFile('scan-1', 'src/a.ts', 4)).resolves.toBeNull();
    port.statRows.mockResolvedValue({});
    await expect(capabilities.readRemoteWorkspaceFile('scan-1', 'src/a.ts', 100)).resolves.toBeNull();
    expect(port.readFile).not.toHaveBeenCalled();
  });

  it('answers null when the read throws', async () => {
    port.readFile.mockRejectedValue(new Error('gone'));
    await expect(capabilitiesFor(fakeManagers()).readRemoteWorkspaceFile('scan-1', 'src/a.ts', 100))
      .resolves.toBeNull();
  });

  it('rejects when the listing fails rather than answering null', async () => {
    port.search.mockRejectedValue(new Error('listing failed'));
    await expect(capabilitiesFor(fakeManagers()).remoteWorkspaceFileList('scan-1'))
      .rejects.toThrow('listing failed');
  });

  it('answers null from both while the plugin is disabled', async () => {
    const capabilities = capabilitiesFor(fakeManagers(), () => false);
    await expect(capabilities.remoteWorkspaceFileList('scan-1')).resolves.toBeNull();
    await expect(capabilities.readRemoteWorkspaceFile('scan-1', 'src/a.ts', 100)).resolves.toBeNull();
    expect(port.search).not.toHaveBeenCalled();
  });
});
