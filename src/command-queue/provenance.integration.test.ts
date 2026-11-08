import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CommandManager } from '../command/manager.js';
import type { CommandInvocationContext } from '../commands/types.js';
import { commands } from '../commands/index.js';
import type { Managers } from '../managers.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../plugins/api.js';
import { TabPluginHost } from '../plugins/host.js';
import { queueCapabilities } from '../plugins/queue-capabilities.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';

describe('server queue provenance integration', () => {
  const fixtures: Array<(typeof commands)[number]> = [];
  const roots: string[] = [];

  afterEach(() => {
    const registered = [...fixtures];
    fixtures.length = 0;
    for (const fixture of registered) commands.splice(commands.indexOf(fixture), 1);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('dispatches the host-owned scheduled row and isolates provenance from ordinary dispatch', async () => {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    const tab = makeTab('schedule-plugin', '#fff');
    tab.view = 'plugin';
    tab.plugin = {
      id: 'schedule-test', instanceKey: 'schedule-tab', schemaVersion: 1,
      payload: {}, fileRefs: [],
    };
    managers.tab.tabs.push(tab);
    managers.command = new CommandManager(managers);
    const contexts: Array<CommandInvocationContext | undefined> = [];
    const scheduled = {
      name: 'fixture-provenance-scheduled',
      match: (line: string) => line === 'fixture-provenance-scheduled',
      samples: ['fixture-provenance-scheduled'],
      run: (_line: string, _target: unknown, _services: Managers, invocation?: CommandInvocationContext) => {
        contexts.push(invocation);
      },
    };
    const ordinary = {
      name: 'fixture-provenance-ordinary',
      match: (line: string) => line === 'fixture-provenance-ordinary',
      samples: ['fixture-provenance-ordinary'],
      run: (_line: string, _target: unknown, _services: Managers, invocation?: CommandInvocationContext) => {
        contexts.push(invocation);
      },
    };
    fixtures.push(scheduled, ordinary);
    commands.push(scheduled, ordinary);

    const declaration: TabPluginDeclaration = {
      id: 'schedule-test', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
      payloadSchemaVersion: 1, tabLabelPrefix: 'schedule', fileExtensions: {},
      capabilities: ['queueLine', 'nextQueuedLine', 'nextQueuedCommand', 'dispatchQueuedCommand'],
    };
    const host = new TabPluginHost(managers, [declaration], {
      'schedule-test': async () => ({ activate: () => ({
        isPayload: () => true,
        intent: () => null,
        opener: {
          inline: async (_file, capabilities) => {
            managers.tab.enqueueSystemSchedule(tab.label, 'fixture-provenance-scheduled', 'daily-build');
            const command = capabilities.nextQueuedCommand();
            expect(command?.line).toBe('fixture-provenance-scheduled');
            await expect(capabilities.dispatchQueuedCommand(command!.receipt)).resolves.toMatchObject({ dispatched: true });
            expect(contexts[0]?.systemSchedule).toEqual({ kind: 'system-schedule', scheduleKey: 'daily-build' });
            capabilities.queueLine('fixture-provenance-ordinary');
            const legacyLine = capabilities.nextQueuedLine();
            expect(legacyLine).toBe('fixture-provenance-ordinary');
            await managers.command.dispatchLineWithOutput(tab.label, legacyLine!);
            expect(contexts[1]?.systemSchedule).toBeUndefined();
            await expect(capabilities.dispatchQueuedCommand(command!.receipt))
              .rejects.toThrow('invalid or stale command queue receipt');
          },
          external: () => {},
        },
      }) }),
    });
    await host.runOpener('schedule-test', 'inline', 'ignored', {
      label: tab.label, command: 'schedule-test',
    });

    expect(host.statusFor('schedule-test')).toMatchObject({ state: 'active' });
  });

  it('checks settings when a queued command is dispatched and keeps the refusal claimed', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'queued-disabled-'));
    roots.push(base);
    const home = path.join(base, 'home');
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    writeFileSync(path.join(home, '.janissary', 'commands.json'), '{}');
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    const tab = makeTab('queue-plugin', '#fff');
    tab.view = 'plugin';
    tab.plugin = {
      id: 'queue-test', instanceKey: 'queue-tab', schemaVersion: 1,
      payload: {}, fileRefs: [],
    };
    managers.tab.tabs.push(tab);
    managers.nativeCommandSettings = new NativeCommandSettingsManager(path.join(base, 'project'), home);
    managers.command = new CommandManager(managers);
    const declaration: TabPluginDeclaration = {
      id: 'queue-test', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
      payloadSchemaVersion: 1, tabLabelPrefix: 'queue', fileExtensions: {},
      capabilities: ['nextQueuedCommand', 'dispatchQueuedCommand'],
    };
    const capabilities = queueCapabilities({
      managers, declaration, origin: { label: tab.label, command: 'queue-test' }, isEnabled: () => true,
    });
    managers.tab.enqueueSystemSchedule(tab.label, 'clear', 'daily-build');
    const command = capabilities.nextQueuedCommand();
    expect(command?.line).toBe('clear');

    await managers.nativeCommandSettings.edit({ name: 'clear', setting: { enabled: false } });

    await expect(capabilities.dispatchQueuedCommand(command!.receipt)).resolves.toEqual({
      dispatched: true, output: 'Command is disabled: clear.',
    });
    await expect(capabilities.dispatchQueuedCommand(command!.receipt))
      .rejects.toThrow('invalid or stale command queue receipt');
  });
});
