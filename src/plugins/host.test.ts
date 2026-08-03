import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Managers } from '../managers.js';
import type {
  TabPluginActivation,
  TabPluginDeclaration,
  TabPluginLoader,
  TabPluginLoaders,
  TabPluginServerCapabilities,
} from './api.js';
import { TAB_PLUGIN_API_VERSION, TAB_PLUGIN_CAPABILITY_NAMES } from './api.js';
import { tabPluginCatalog } from './catalog.js';
import { TabPluginHost } from './host.js';
import { tabPluginLoaders } from './loaders.js';
import { clearContributionRejections, rejectContribution } from './rejections.js';

const origin = { label: 'janus', command: 'open fixture.test' };

function declaration(overrides: Partial<TabPluginDeclaration> = {}): TabPluginDeclaration {
  return {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
    // These cases exercise the host, not capability narrowing, so the default declaration grants
    // everything. `context.test.ts` owns the enforcement of a narrower one.
    capabilities: TAB_PLUGIN_CAPABILITY_NAMES, ...overrides,
  };
}

function activation(overrides: Partial<TabPluginActivation> = {}): TabPluginActivation {
  return {
    isPayload: () => true,
    opener: { inline: () => {}, external: () => {} },
    intent: () => null,
    ...overrides,
  };
}

function loader(value: TabPluginActivation): TabPluginLoader {
  return async () => ({ activate: () => value });
}

function makeManagers() {
  const append = vi.fn();
  const closeTab = vi.fn();
  const openPluginTab = vi.fn();
  const runAs = vi.fn(async () => {});
  const tabs = [{ label: 'janus', dotColor: '#fff', log: [] }];
  const managers = {
    tab: { tabs, append, closeTab, openPluginTab, cur: () => tabs[0] },
    openFile: { runAs },
  } as unknown as Managers;
  return { append, closeTab, managers, openPluginTab, runAs };
}

describe('tab plugin discovery', () => {
  it('keeps the catalog manifest-only and pins server loader parity', () => {
    const source = readFileSync(new URL('catalog.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/activate\.js/u);
    expect(Object.keys(tabPluginLoaders).toSorted((a, b) => a.localeCompare(b))).toEqual(
      tabPluginCatalog.map((item) => item.id).toSorted((a, b) => a.localeCompare(b)),
    );
    expect(tabPluginCatalog.map((item) => item.id)).not.toContain('fixture-v1');
  });

  it('rejects duplicate plugin ids at host construction', () => {
    const { managers } = makeManagers();
    expect(() => new TabPluginHost(managers, [declaration(), declaration()], {}))
      .toThrow('Duplicate tab plugin id "fixture"');
  });

  it('starts a plugin disabled when the registries refused its claims', async () => {
    const { managers } = makeManagers();
    clearContributionRejections();
    rejectContribution('fixture', 'reserved tab plugin command claim "open"');
    const load = vi.fn(loader(activation()));
    const host = new TabPluginHost(managers, [declaration()], { fixture: load });

    expect(host.statusFor('fixture')).toEqual({
      state: 'disabled', reason: 'reserved tab plugin command claim "open"',
    });
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    expect(load).not.toHaveBeenCalled();
    clearContributionRejections();
  });
});

describe('TabPluginHost commands', () => {
  it('runs the declared command and queues its claimed opens against its own opener', async () => {
    const { managers, runAs } = makeManagers();
    const command = vi.fn((argument: string, capabilities: TabPluginServerCapabilities) => {
      capabilities.openClaimedFiles(argument);
    });
    const host = new TabPluginHost(
      managers, [declaration({ command: 'fixture' })], { fixture: loader(activation({ command })) },
    );

    await host.runCommand('fixture', 'fixture  ~/clips/*.fixture', {
      label: 'janus', command: 'fixture  ~/clips/*.fixture',
    });

    expect(command).toHaveBeenCalledWith('~/clips/*.fixture', expect.any(Object));
    expect(runAs).toHaveBeenCalledWith(
      'open ~/clips/*.fixture', 'fixture  ~/clips/*.fixture', 'janus', 'fixture',
    );
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('reports a rejection to the transcript and leaves the plugin enabled', async () => {
    const { append, managers, runAs } = makeManagers();
    const command = (_argument: string, capabilities: TabPluginServerCapabilities) =>
      capabilities.rejectRequest('Usage: fixture <path>');
    const host = new TabPluginHost(
      managers, [declaration({ command: 'fixture' })], { fixture: loader(activation({ command })) },
    );

    await host.runCommand('fixture', 'fixture', { label: 'janus', command: 'fixture' });

    expect(append).toHaveBeenCalledWith('janus', {
      input: 'fixture', output: 'Usage: fixture <path>',
    });
    expect(runAs).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('rejects rather than disabling when a claimed command has no handler', async () => {
    const { append, managers } = makeManagers();
    const host = new TabPluginHost(
      managers, [declaration({ command: 'fixture' })], { fixture: loader(activation()) },
    );

    await host.runCommand('fixture', 'fixture path', { label: 'janus', command: 'fixture path' });

    expect(append).toHaveBeenCalledWith('janus', expect.objectContaining({
      output: 'Tab plugin "fixture" claims a command but provides no handler',
    }));
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('does not run queued opens for a call that ended up failing', async () => {
    const { managers, runAs } = makeManagers();
    const command = (argument: string, capabilities: TabPluginServerCapabilities) => {
      capabilities.openClaimedFiles(argument);
      throw new Error('command exploded after queueing');
    };
    const host = new TabPluginHost(
      managers, [declaration({ command: 'fixture' })], { fixture: loader(activation({ command })) },
    );

    await host.runCommand('fixture', 'fixture clip', { label: 'janus', command: 'fixture clip' });

    expect(runAs).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')).toMatchObject({
      state: 'disabled', reason: 'command exploded after queueing',
    });
  });
});

describe('TabPluginHost activation', () => {
  it('refuses an incompatible API before importing behavior', async () => {
    const { append, managers } = makeManagers();
    const load = vi.fn(loader(activation()));
    const manifest = declaration({ apiVersion: TAB_PLUGIN_API_VERSION + 1 });
    const host = new TabPluginHost(managers, [manifest], { fixture: load });

    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);

    expect(load).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')).toMatchObject({ state: 'disabled', reason: expect.stringContaining('host provides') });
    expect(append).toHaveBeenCalledWith('janus', expect.objectContaining({
      output: expect.stringContaining('requires tab plugin API'),
    }));
  });

  it('rejects unknown requested capabilities', async () => {
    const { managers } = makeManagers();
    const manifest = declaration({ capabilities: ['future-capability'] as never });
    const host = new TabPluginHost(managers, [manifest], { fixture: loader(activation()) });
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    expect(host.statusFor('fixture')).toEqual({
      state: 'disabled', reason: 'requests unknown capability "future-capability"',
    });
  });

  it('shares one activation promise across concurrent first requests', async () => {
    const { managers } = makeManagers();
    const deferred = Promise.withResolvers<{ activate(): TabPluginActivation }>();
    const activate = vi.fn(() => activation());
    const load = vi.fn(async () => deferred.promise);
    const host = new TabPluginHost(managers, [declaration()], { fixture: load });

    const first = host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    const second = host.runOpener('fixture', 'inline', '/tmp/b.fixture', origin);
    expect(load).toHaveBeenCalledOnce();
    deferred.resolve({ activate });
    await Promise.all([first, second]);

    expect(activate).toHaveBeenCalledOnce();
    expect(host.statusFor('fixture')).toMatchObject({ state: 'active', activationMs: expect.any(Number) });
  });

  it('records activation throws and never imports the disabled plugin again', async () => {
    const { managers } = makeManagers();
    const load = vi.fn(async () => ({ activate: () => { throw new Error('activation exploded'); } }));
    const host = new TabPluginHost(managers, [declaration()], { fixture: load });
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    expect(load).toHaveBeenCalledOnce();
    expect(host.statusFor('fixture')).toEqual({ state: 'disabled', reason: 'activation exploded' });
  });

  it('times out activation and disposes a late result', async () => {
    const { managers } = makeManagers();
    const deferred = Promise.withResolvers<{ activate(): TabPluginActivation }>();
    const dispose = vi.fn(async () => { throw new Error('late disposal rejected'); });
    const host = new TabPluginHost(
      managers, [declaration()], { fixture: async () => deferred.promise }, { activationTimeoutMs: 5 },
    );

    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    expect(host.statusFor('fixture')).toEqual({
      state: 'disabled', reason: 'activation timed out after 5 ms',
    });
    deferred.resolve({ activate: () => activation({ dispose }) });
    await vi.waitFor(() => { expect(dispose).toHaveBeenCalledOnce(); });
    expect(host.statusFor('fixture')?.state).toBe('disabled');
  });

  it('disables on guarded handler failure for the rest of the process', async () => {
    const { managers } = makeManagers();
    const inline = vi.fn(() => { throw new Error('handler exploded'); });
    const load = vi.fn(loader(activation({ opener: { inline, external: () => {} } })));
    const host = new TabPluginHost(managers, [declaration()], { fixture: load });
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    await host.runOpener('fixture', 'inline', '/tmp/b.fixture', origin);
    expect(inline).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(host.statusFor('fixture')).toEqual({ state: 'disabled', activationMs: expect.any(Number), reason: 'handler exploded' });
  });

  it('revokes capabilities from a handler that continues after timing out', async () => {
    const { managers, openPluginTab } = makeManagers();
    const release = Promise.withResolvers<void>();
    const continued = Promise.withResolvers<void>();
    const inline = vi.fn(async (_file, capabilities) => {
      await release.promise;
      capabilities.openOrFocusTab('late', () => ({ title: 'late', payload: {} }));
      continued.resolve();
    });
    const host = new TabPluginHost(
      managers,
      [declaration()],
      { fixture: loader(activation({ opener: { inline, external: () => {} } })) },
      { handlerTimeoutMs: 5 },
    );

    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    expect(host.statusFor('fixture')).toMatchObject({
      state: 'disabled', reason: 'handler timed out after 5 ms',
    });
    release.resolve();
    await continued.promise;
    expect(openPluginTab).not.toHaveBeenCalled();
  });

  it('disposes an active plugin exactly once on shutdown', async () => {
    const { managers } = makeManagers();
    const dispose = vi.fn();
    const host = new TabPluginHost(
      managers, [declaration()], { fixture: loader(activation({ dispose })) } as TabPluginLoaders,
    );
    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);
    host.dispose();
    host.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
