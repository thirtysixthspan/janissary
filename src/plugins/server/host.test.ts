import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import { availableCommands } from '../../commands.js';
import { coreCommands } from '../../commands/index.js';
import { coreOpeners } from '../../openers/index.js';
import { openNotificationsTab } from '../../notifications-tab.js';
import { TabManager } from '../../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION, type TabPluginActivation, type TabPluginDeclaration, type TabPluginServerLoader,
} from '../api.js';
import { CORE_MIME } from '../../mime-types.js';
import { pluginManifests, pluginMimeTypes } from '../manifests.js';
import { serverPluginLoaders } from './loaders.js';
import { pluginCommands, pluginOpeners } from './adapters.js';
import { catalogErrors, catalogLoaderErrors } from './catalog.js';
import { PluginHost } from './host.js';

function declaration(overrides: Partial<TabPluginDeclaration> = {}): TabPluginDeclaration {
  return {
    id: 'test-plugin',
    version: '1.0.0',
    requiredApiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    tab: { labelPrefix: 'test' },
    commands: ['test-plugin'],
    capabilities: ['transcript', 'plugin-tabs', 'served-files', 'external-viewer', 'external-open'],
    ...overrides,
  };
}

function activation(overrides: Partial<TabPluginActivation> = {}): TabPluginActivation {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    validateTabPayload: () => true,
    commands: { 'test-plugin': vi.fn() },
    ...overrides,
  };
}

function makeManagers(
  manifest: TabPluginDeclaration,
  loader: TabPluginServerLoader,
  options: { activationBudgetMs?: number; handlerBudgetMs?: number; now?: () => number } = {},
): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.plugins = new PluginHost(managers, {
    declarations: [manifest], loaders: { [manifest.id]: loader }, ...options,
  });
  return managers;
}

function errorsFor(declarations: readonly TabPluginDeclaration[]): Map<string, string> {
  return catalogErrors(declarations, coreCommands, availableCommands, coreOpeners, CORE_MIME);
}

function text(managers: Managers, label = 'janus'): string {
  return managers.tab.tabs.find((tab) => tab.label === label)?.log.map((entry) => entry.output).join('\n') ?? '';
}

async function makeIntentManagers(overrides: Partial<TabPluginActivation> = {}) {
  const handleIntent = vi.fn((request: { payload: unknown }) => ({ schemaVersion: 1, payload: request.payload }));
  const managers = makeManagers(declaration(), async () => ({
    activate: (capabilities) => activation({
      commands: {
        'test-plugin': (_command, context) => capabilities.openPluginTab({
          originLabel: context.originLabel,
          instanceKey: 'intent-tab',
          title: 'intent',
          create: () => ({ message: 'ready' }),
        }),
      },
      validateIntent: (intent, payload) => intent === 'echo'
        && typeof payload === 'object' && payload !== null && typeof (payload as { message?: unknown }).message === 'string',
      handleIntent,
      validateIntentReply: (intent, payload) => intent === 'echo'
        && typeof payload === 'object' && payload !== null && typeof (payload as { message?: unknown }).message === 'string',
      ...overrides,
    }),
  }));
  await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');
  const tab = managers.tab.tabs.find((candidate) => candidate.plugin?.pluginId === 'test-plugin')!;
  return { managers, tab, handleIntent };
}

describe('tab plugin catalog', () => {
  it('discovers declarations without importing behavior and pins production loader parity', () => {
    const load = vi.fn(async () => ({ activate: () => activation() }));
    const managers = makeManagers(declaration(), load);
    expect(managers.plugins.status('test-plugin').state).toBe('inactive');
    expect(load).not.toHaveBeenCalled();
    expect(catalogLoaderErrors(pluginManifests, serverPluginLoaders)).toEqual(new Map());
  });

  it('rejects incompatible major and newer minor API requirements before import', async () => {
    for (const requiredApiVersion of [{ major: 2, minor: 0 }, { major: 1, minor: 1 }]) {
      const manifest = declaration({ requiredApiVersion });
      const load = vi.fn(async () => ({ activate: () => activation() }));
      const managers = makeManagers(manifest, load);
      await managers.plugins.runCommand(manifest.id, 'test-plugin', 'test-plugin', 'janus');
      expect(managers.plugins.status(manifest.id).state).toBe('disabled');
      expect(load).not.toHaveBeenCalled();
    }
  });

  it('accepts the current major with an older or equal required minor', async () => {
    const load = vi.fn(async () => ({ activate: () => activation() }));
    const managers = makeManagers(declaration({ requiredApiVersion: { major: 1, minor: 0 } }), load);
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');
    expect(managers.plugins.status('test-plugin').state).toBe('active');
  });

  it('rejects every reserved command route and duplicate command, extension, and MIME claim', () => {
    const reservedNames = new Set([
      ...availableCommands, ...coreCommands.map((command) => command.name), 'shell', 'harness', 'ssh', 'schedule',
    ]);
    for (const name of reservedNames) {
      const errors = errorsFor([declaration({ id: `claim-${name}`, commands: [name] })]);
      expect(errors.get(`claim-${name}`)).toContain('collides with a core route');
    }
    const first = declaration({ id: 'first', commands: ['plug'], opener: { extensions: ['.one'], mimeTypes: { '.one': 'x/one' } } });
    const second = declaration({ id: 'second', commands: ['PLUG'], opener: { extensions: ['.ONE'], mimeTypes: { '.one': 'x/two' } } });
    expect(errorsFor([first, second]).get('second')).toMatch(/duplicate/);
    const coreCollision = declaration({ id: 'core-collision', commands: [], opener: { extensions: ['.png'], mimeTypes: {} } });
    expect(errorsFor([coreCollision]).get('core-collision')).toContain('duplicate opener');
  });

  it('rejects a MIME claim on an extension the host already serves', () => {
    const shadow = declaration({ id: 'shadow', commands: [], opener: { extensions: ['.clip'], mimeTypes: { '.PNG': 'x/hijack' } } });
    expect(errorsFor([shadow]).get('shadow')).toContain('duplicate MIME claim');
  });

  it('registers no adapter for a claim the catalog rejected', () => {
    const collides = declaration({ id: 'collides', commands: ['open'], opener: undefined });
    const usable = declaration({ id: 'usable', commands: ['usable-tab'], opener: undefined });
    const shadows = declaration({ id: 'shadows', commands: [], opener: { extensions: ['.png'], mimeTypes: {} } });
    const invalid = declaration({ id: 'invalid', payloadSchemaVersion: 0 });

    expect(pluginCommands([collides, usable], coreCommands, availableCommands).map((command) => command.name))
      .toEqual(['usable-tab']);
    expect(pluginOpeners([shadows], coreOpeners)).toEqual([]);
    expect(pluginCommands([invalid], coreCommands, availableCommands)).toEqual([]);
  });

  it('keeps every production MIME claim out of the core table', () => {
    for (const extension of Object.keys(pluginMimeTypes())) {
      expect(Object.hasOwn(CORE_MIME, extension)).toBe(false);
    }
  });
});

describe('PluginHost activation lifecycle', () => {
  it('disables activation results with an incompatible API or payload schema', async () => {
    for (const overrides of [
      { apiVersion: { major: 2, minor: 0 } },
      { apiVersion: { major: 1, minor: 1 } },
      { payloadSchemaVersion: 2 },
    ]) {
      const managers = makeManagers(declaration(), async () => ({ activate: () => activation(overrides) }));
      await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');
      expect(managers.plugins.status('test-plugin').state).toBe('disabled');
    }
  });

  it('shares one in-flight activation, activates once, and records elapsed time', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const activate = vi.fn(async () => { await gate; return activation(); });
    const load = vi.fn(async () => ({ activate }));
    const times = [10, 34];
    const managers = makeManagers(declaration(), load, { now: () => times.shift() ?? 34 });
    const first = managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    const second = managers.plugins.runCommand('test-plugin', 'test-plugin', 'two', 'janus');
    await vi.waitFor(() => { expect(managers.plugins.status('test-plugin').state).toBe('activating'); });
    release();
    await Promise.all([first, second]);
    expect(load).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledOnce();
    expect(managers.plugins.status('test-plugin')).toMatchObject({ state: 'active', activationMs: 24 });
  });

  it('times out activation, disposes a late result, and never retries it', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const dispose = vi.fn();
    const load = vi.fn(async () => {
      await gate;
      return { activate: () => activation({ dispose }) };
    });
    const managers = makeManagers(declaration(), load, { activationBudgetMs: 5 });
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    expect(managers.plugins.status('test-plugin')).toMatchObject({ state: 'disabled', reason: expect.stringContaining('timed out') });
    release();
    await vi.waitFor(() => { expect(dispose).toHaveBeenCalledOnce(); });
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'two', 'janus');
    expect(load).toHaveBeenCalledOnce();
  });

  it('contains an activation throw for the rest of the process', async () => {
    const load = vi.fn(async () => ({ activate: () => { throw new Error('activation broke.'); } }));
    const managers = makeManagers(declaration(), load);
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'two', 'janus');
    expect(load).toHaveBeenCalledOnce();
    expect(text(managers)).toContain('Tab plugin "test-plugin" disabled: activation broke.');
  });

  it('contains a guarded handler throw and preserves one final period', async () => {
    const handler = vi.fn(() => { throw new Error('handler broke!!!'); });
    const load = vi.fn(async () => ({ activate: () => activation({ commands: { 'test-plugin': handler } }) }));
    const managers = makeManagers(declaration(), load);
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'two', 'janus');
    expect(handler).toHaveBeenCalledOnce();
    expect(text(managers)).toContain('Tab plugin "test-plugin" disabled: handler broke.');
    expect(text(managers)).not.toContain('handler broke..');
  });

  it('rejects a declaration naming a capability this API version does not define', () => {
    const manifest = { ...declaration(), capabilities: ['transcript', 'telepathy'] } as unknown as TabPluginDeclaration;
    const load = vi.fn(async () => ({ activate: () => activation() }));
    const managers = makeManagers(manifest, load);

    expect(managers.plugins.status('test-plugin')).toMatchObject({
      state: 'disabled', reason: 'unknown capability "telepathy"',
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('disables a plugin that calls a capability it never declared', async () => {
    const manifest = declaration({ capabilities: ['plugin-tabs'] });
    const managers = makeManagers(manifest, async () => ({
      activate: (capabilities) => activation({
        commands: { 'test-plugin': (_command, context) => { capabilities.report(context.originLabel, 'hello'); } },
      }),
    }));

    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');

    expect(managers.plugins.status('test-plugin').state).toBe('disabled');
    expect(text(managers)).toContain('Tab plugin "test-plugin" disabled: capability "transcript" was not declared.');
  });

  it('refuses served files to a plugin that only declared tab opening', async () => {
    const manifest = declaration({ capabilities: ['plugin-tabs'] });
    const managers = makeManagers(manifest, async () => ({
      activate: (capabilities) => activation({
        commands: {
          'test-plugin': (_command, context) => capabilities.openPluginTab({
            originLabel: context.originLabel, instanceKey: 'files', title: 'files',
            create: ({ registerFile }) => ({ resource: registerFile('/tmp/undeclared-served-file') }),
          }),
        },
      }),
    }));

    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');

    expect(managers.plugins.status('test-plugin').state).toBe('disabled');
    expect(managers.tab.openFiles.size).toBe(0);
    expect(managers.tab.tabs.some((tab) => tab.view === 'plugin')).toBe(false);
  });

  it('disables invalid host-produced payloads and releases resources acquired while building them', async () => {
    const managers = makeManagers(declaration(), async () => ({
      activate: (capabilities) => activation({
        validateTabPayload: () => false,
        commands: {
          'test-plugin': (_command, context) => capabilities.openPluginTab({
            originLabel: context.originLabel, instanceKey: 'bad', title: 'bad',
            create: ({ registerFile }) => ({ resource: registerFile('/tmp/bad-plugin-payload') }),
          }),
        },
      }),
    }));

    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'test-plugin', 'janus');

    expect(managers.plugins.status('test-plugin').state).toBe('disabled');
    expect(managers.tab.openFiles.size).toBe(0);
    expect(text(managers)).toContain('Tab plugin "test-plugin" disabled: plugin produced an invalid tab payload.');
  });

  it('treats a handler deadline as a process-lifetime failure', async () => {
    const handler = vi.fn(() => new Promise<void>(() => {}));
    const load = vi.fn(async () => ({ activate: () => activation({ commands: { 'test-plugin': handler } }) }));
    const managers = makeManagers(declaration(), load, { handlerBudgetMs: 5 });
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'two', 'janus');
    expect(handler).toHaveBeenCalledOnce();
    expect(managers.plugins.status('test-plugin').reason).toContain('timed out');
  });

  it('disposes an activated plugin exactly once across repeated shutdown calls', async () => {
    const dispose = vi.fn();
    const managers = makeManagers(declaration(), async () => ({ activate: () => activation({ dispose }) }));
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    await managers.plugins.dispose();
    await managers.plugins.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('PluginHost intent boundary', () => {
  it('rejects invalid client payloads without disabling or invoking plugin behavior', async () => {
    const { managers, tab, handleIntent } = await makeIntentManagers();

    await expect(managers.plugins.pluginIntent({
      tab: tab.label, schemaVersion: 1, intent: 'echo', payload: { invalid: true },
    })).rejects.toThrow('pluginIntent: invalid "echo" payload');

    expect(managers.plugins.status('test-plugin').state).toBe('active');
    expect(handleIntent).not.toHaveBeenCalled();
  });

  it('rejects schema mismatches, reserved intents, and closed tabs without disabling the plugin', async () => {
    const { managers, tab, handleIntent } = await makeIntentManagers();
    await expect(managers.plugins.pluginIntent({
      tab: tab.label, schemaVersion: 2, intent: 'echo', payload: { message: 'hello' },
    })).rejects.toThrow('schema version mismatch');
    await expect(managers.plugins.pluginIntent({
      tab: tab.label, schemaVersion: 1, intent: '$host/not-public', payload: {},
    })).rejects.toThrow('reserved host intent');
    managers.tab.tabs.splice(managers.tab.tabs.findIndex((candidate) => candidate.label === tab.label), 1);
    await expect(managers.plugins.pluginIntent({
      tab: tab.label, schemaVersion: 1, intent: 'echo', payload: { message: 'hello' },
    })).rejects.toThrow('not found');
    expect(managers.plugins.status('test-plugin').state).toBe('active');
    expect(handleIntent).not.toHaveBeenCalled();
  });

  it('contains validator throws and does not invoke the handler or retry', async () => {
    const validateIntent = vi.fn(() => { throw new Error('validator broke'); });
    const { managers, tab, handleIntent } = await makeIntentManagers({ validateIntent });
    const request = { tab: tab.label, schemaVersion: 1, intent: 'echo', payload: { message: 'hello' } };

    await expect(managers.plugins.pluginIntent(request)).rejects.toThrow('Tab plugin "test-plugin" disabled: validator broke.');
    await expect(managers.plugins.pluginIntent(request)).rejects.toThrow('Tab plugin "test-plugin" disabled: validator broke.');

    expect(validateIntent).toHaveBeenCalledOnce();
    expect(handleIntent).not.toHaveBeenCalled();
  });

  it('disables invalid replies and does not invoke the handler again', async () => {
    const handleIntent = vi.fn(() => ({ schemaVersion: 2, payload: { message: 'bad' } }));
    const setup = await makeIntentManagers({ handleIntent });
    const request = { tab: setup.tab.label, schemaVersion: 1, intent: 'echo', payload: { message: 'hello' } };

    await expect(setup.managers.plugins.pluginIntent(request)).rejects.toThrow('invalid intent reply');
    await expect(setup.managers.plugins.pluginIntent(request)).rejects.toThrow('Tab plugin "test-plugin" disabled');
    expect(handleIntent).toHaveBeenCalledOnce();
  });

  it('accepts the reserved client-failure report, disables once, and disposes once', async () => {
    const dispose = vi.fn();
    const { managers, tab } = await makeIntentManagers({ dispose });
    const request = {
      tab: tab.label, schemaVersion: 1, intent: '$host/client-failure', payload: { reason: 'chunk broke!!!' },
    };

    await expect(managers.plugins.pluginIntent(request)).rejects.toThrow('Tab plugin "test-plugin" disabled: chunk broke.');
    await expect(managers.plugins.pluginIntent(request)).rejects.toThrow('Tab plugin "test-plugin" disabled: chunk broke.');
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('PluginHost failure delivery', () => {
  const brokenLoader = async () => ({ activate: () => { throw new Error('broken'); } });

  it('does not recreate a closed origin and still reaches an already-open notifications feed', async () => {
    const managers = makeManagers(declaration(), brokenLoader);
    openNotificationsTab(managers);
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'closed-origin');
    expect(managers.tab.tabs.some((tab) => tab.label === 'closed-origin')).toBe(false);
    expect(text(managers, 'notifications')).toContain('Tab plugin "test-plugin" disabled: broken.');
  });

  it('does not create or buffer notifications while the feed is closed', async () => {
    const managers = makeManagers(declaration(), brokenLoader);
    await managers.plugins.runCommand('test-plugin', 'test-plugin', 'one', 'janus');
    expect(managers.tab.tabs.some((tab) => tab.view === 'notifications')).toBe(false);
    openNotificationsTab(managers);
    expect(text(managers, 'notifications')).not.toContain('Tab plugin');
  });
});
