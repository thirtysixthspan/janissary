import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab/index.js';
import { closeTabResources } from '../tab/cleanup.js';
import type { Tab } from '../tab/types.js';
import type { TabPluginDeclaration } from './api.js';
import { releasePluginRemoteResource } from './remote-capabilities.js';
import { remoteJoinCapabilities } from './remote-join-capabilities.js';

vi.mock('./remote-capabilities.js', () => ({
  releasePluginRemoteResource: vi.fn(),
  releasePluginRemoteResources: vi.fn(),
}));

const declaration = { id: 'search' } as TabPluginDeclaration;
const SOURCE = 'agent-1';
const OWN = 'search-1';

type Setup = { own: Tab; source: Tab; managers: Managers; remote: Record<string, ReturnType<typeof vi.fn>> };

function setup(): Setup {
  const own = makeTab(OWN, 'red');
  const source = makeTab(SOURCE, 'blue');
  source.remote = { address: 'dev@box', host: 'box' };
  const tabs = [own, source];
  const remote = {
    get: vi.fn((label: string) => (label === SOURCE ? {} : undefined)),
    reconnectingOf: vi.fn(() => false),
    attach: vi.fn(() => true),
    release: vi.fn(() => true),
    entryOf: vi.fn(),
    closeTab: vi.fn(),
  };
  const noop = { closeTab: vi.fn() };
  const managers = {
    tab: {
      pluginTabByInstanceKey: vi.fn((id: string, key: string) => (id === 'search' && key === 'k1' ? own : undefined)),
      byLabel: vi.fn((label: string) => tabs.find((tab) => tab.label === label)),
      deleteBusy: vi.fn(),
    },
    remote,
    workspace: { release: vi.fn(), cancel: vi.fn() },
    shell: noop, acp: noop, browser: noop, pty: noop, harness: noop, terminalRuntime: noop, shellTranscript: noop,
    fileNavigator: noop, editorWatch: noop, editorAcp: noop, schedule: noop, questions: noop,
    database: { forgetTab: vi.fn(), closeTab: vi.fn(), closeAll: vi.fn() },
    communication: noop, command: noop,
  } as unknown as Managers;
  return { own, source, managers, remote };
}

describe('remoteJoinCapabilities', () => {
  let emit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { emit = vi.spyOn(messageBus, 'emit'); });
  afterEach(() => { vi.restoreAllMocks(); vi.mocked(releasePluginRemoteResource).mockClear(); });

  const caps = (managers: Managers, enabled = true) =>
    remoteJoinCapabilities({ managers, declaration, isEnabled: () => enabled });

  it('joins in place, copying the source remote and emitting dirty', () => {
    const { own, source, managers, remote } = setup();
    expect(caps(managers).joinRemoteWorkspace('k1', SOURCE)).toBe(true);
    expect(remote.attach).toHaveBeenCalledWith(OWN, SOURCE);
    expect(own.remote).toEqual({ address: 'dev@box', host: 'box' });
    expect(own.remote).not.toBe(source.remote);
    expect(own.label).toBe(OWN);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('refuses a source with no remote, no channel, or reconnecting, without attaching', () => {
    const noRemote = setup();
    delete noRemote.source.remote;
    expect(caps(noRemote.managers).joinRemoteWorkspace('k1', SOURCE)).toBe(false);
    const noChannel = setup();
    noChannel.remote.get.mockImplementation(() => {});
    expect(caps(noChannel.managers).joinRemoteWorkspace('k1', SOURCE)).toBe(false);
    const reconnecting = setup();
    reconnecting.remote.reconnectingOf.mockReturnValue(true);
    expect(caps(reconnecting.managers).joinRemoteWorkspace('k1', SOURCE)).toBe(false);
    for (const item of [noRemote, noChannel, reconnecting]) {
      expect(item.remote.attach).not.toHaveBeenCalled();
      expect(item.own.remote).toBeUndefined();
    }
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses when attach answers false', () => {
    const { own, managers, remote } = setup();
    remote.attach.mockReturnValue(false);
    expect(caps(managers).joinRemoteWorkspace('k1', SOURCE)).toBe(false);
    expect(own.remote).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('releases the channel, clears remote, and drops the port', () => {
    const { own, managers, remote } = setup();
    const capabilities = caps(managers);
    capabilities.joinRemoteWorkspace('k1', SOURCE);
    emit.mockClear();
    capabilities.releaseRemoteWorkspace('k1');
    expect(remote.release).toHaveBeenCalledWith(OWN);
    expect(own.remote).toBeUndefined();
    expect(releasePluginRemoteResource).toHaveBeenCalledWith(OWN);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('changes nothing while disabled', () => {
    const { own, managers, remote } = setup();
    const capabilities = caps(managers, false);
    expect(capabilities.joinRemoteWorkspace('k1', SOURCE)).toBe(false);
    own.remote = { address: 'dev@box', host: 'box' };
    capabilities.releaseRemoteWorkspace('k1');
    expect(remote.attach).not.toHaveBeenCalled();
    expect(remote.release).not.toHaveBeenCalled();
    expect(own.remote).toBeDefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('release on a tab riding nothing or an unknown key does nothing', () => {
    const { managers, remote } = setup();
    const capabilities = caps(managers);
    capabilities.releaseRemoteWorkspace('k1');
    capabilities.releaseRemoteWorkspace('missing');
    expect(remote.release).not.toHaveBeenCalled();
    expect(releasePluginRemoteResource).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('closing a joined tab releases through cleanup, and a released one does not', () => {
    const { own, managers, remote } = setup();
    const capabilities = caps(managers);
    capabilities.joinRemoteWorkspace('k1', SOURCE);
    closeTabResources(own, managers, new Map());
    expect(remote.closeTab).toHaveBeenCalledWith(OWN);
    remote.closeTab.mockClear();
    capabilities.releaseRemoteWorkspace('k1');
    closeTabResources(own, managers, new Map());
    expect(remote.closeTab).not.toHaveBeenCalled();
  });
});
