import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginActivation, type TabPluginDeclaration } from './api.js';
import { TabPluginHost } from './host.js';

// A line typed into a plugin tab's command bar can be any application command — another plugin's,
// a large `open`, an agent launch — and the plugin waiting on it must not be disabled because that
// command was slow. The plugin's own time is still bounded; only the command's runtime is exempt.
const declaration: TabPluginDeclaration = {
  id: 'shell', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'shell', fileExtensions: {},
  capabilities: ['dispatchLineWithOutput'],
};

const HANDLER_TIMEOUT_MS = 20;
const SLOW_COMMAND_MS = 100;
const SLOW_TERMINATION_CLEANUP_MS = 5100;

function setup(intent: TabPluginActivation['intent']) {
  const plugin = {
    id: 'shell', instanceKey: 'shell-1', schemaVersion: 1,
    payload: {}, fileRefs: [], sourceLabel: 'janus',
  };
  const tabs = [
    { label: 'janus', dotColor: '#fff', log: [] },
    { label: 'shell', dotColor: '#123', log: [], plugin },
  ];
  const closeTab = vi.fn();
  const dispatchLineWithOutput = vi.fn((_label: string, line: string) => new Promise((resolve) => {
    setTimeout(() => { resolve({ dispatched: true, output: `ran ${line}` }); }, SLOW_COMMAND_MS);
  }));
  const managers = {
    tab: { tabs, append: vi.fn(), closeTab, cur: () => tabs[0], ...fakeNotificationsHost(tabs) },
    command: { dispatchLineWithOutput },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  const activation: TabPluginActivation = {
    isPayload: () => true,
    opener: { inline: () => {}, external: () => {} },
    intent,
  };
  const host = new TabPluginHost(
    managers, [declaration], { shell: async () => ({ activate: () => activation }) },
    { handlerTimeoutMs: HANDLER_TIMEOUT_MS },
  );
  return { closeTab, dispatchLineWithOutput, host };
}

describe('dispatching an application command from a plugin intent', () => {
  it('answers with a slow command\'s output and leaves the plugin and its tabs alone', async () => {
    const fixture = setup((request, capabilities) =>
      capabilities.dispatchLineWithOutput(request.payload as string));

    await expect(fixture.host.intent('shell', 'dispatch', 'slow-command'))
      .resolves.toEqual({ dispatched: true, output: 'ran slow-command' });

    expect(fixture.dispatchLineWithOutput).toHaveBeenCalledWith('shell', 'slow-command');
    expect(fixture.host.statusFor('shell')).toMatchObject({ state: 'active' });
    expect(fixture.closeTab).not.toHaveBeenCalled();
  });

  it('forwards a structured result after slow host work without charging it to the plugin', async () => {
    const fixture = setup((_request, capabilities) => capabilities.dispatchLineWithOutput('agent execute task.md'));
    fixture.dispatchLineWithOutput.mockImplementation(async () => new Promise((resolve) => {
      setTimeout(() => { resolve({ dispatched: true, output: '', result: { status: 'completed' } }); }, SLOW_COMMAND_MS);
    }));

    await expect(fixture.host.intent('shell', 'dispatch', 'slow-agent'))
      .resolves.toEqual({ dispatched: true, output: '', result: { status: 'completed' } });
    expect(fixture.host.statusFor('shell')).toMatchObject({ state: 'active' });
  });

  it('still disables a plugin whose own handler hangs', async () => {
    const fixture = setup(() => new Promise(() => {}));

    await expect(fixture.host.intent('shell', 'dispatch', 'ls'))
      .rejects.toThrow(`Tab plugin "shell" disabled: handler timed out after ${HANDLER_TIMEOUT_MS} ms.`);

    expect(fixture.host.statusFor('shell')).toMatchObject({ state: 'disabled' });
    expect(fixture.closeTab).toHaveBeenCalledWith(1);
  });

  it('still times the plugin\'s own work after the command answers', async () => {
    const fixture = setup(async (request, capabilities) => {
      const reply = await capabilities.dispatchLineWithOutput(request.payload as string);
      await new Promise(() => {});
      return reply;
    });

    await expect(fixture.host.intent('shell', 'dispatch', 'slow-command'))
      .rejects.toThrow('handler timed out');

    expect(fixture.dispatchLineWithOutput).toHaveBeenCalledOnce();
    expect(fixture.host.statusFor('shell')).toMatchObject({ state: 'disabled' });
  });
});

function setupMonitorTermination(cleanupDelayMs: number, runAvailable = true) {
  const plugin = {
    id: 'agent-monitor', instanceKey: 'monitor-run-1', schemaVersion: 1,
    payload: {}, fileRefs: [], sourceLabel: 'agent1', agentRunId: 'run-1',
  };
  const tabs = [
    { label: 'agent1', dotColor: '#fff', log: [] },
    { label: 'agent-monitor', dotColor: '#123', log: [], plugin },
  ];
  const closeTab = vi.fn();
  const finish = vi.fn(async () => new Promise<void>((resolve) => {
    setTimeout(resolve, cleanupDelayMs);
  }));
  const runs = new Map(runAvailable ? [['run-1', {}]] : []);
  const managers = {
    tab: { tabs, append: vi.fn(), closeTab, cur: () => tabs[0], ...fakeNotificationsHost(tabs) },
    agent: { runs, finish },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  const declaration: TabPluginDeclaration = {
    id: 'agent-monitor', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'agent-monitor', fileExtensions: {},
    agentMonitor: true, capabilities: ['terminateAgentRun'],
  };
  const activation: TabPluginActivation = {
    isPayload: () => true,
    opener: { inline: () => {}, external: () => {} },
    intent: async (_request, capabilities) => {
      await capabilities.terminateAgentRun();
      return null;
    },
  };
  const host = new TabPluginHost(
    managers, [declaration], { 'agent-monitor': async () => ({ activate: () => activation }) },
    { handlerTimeoutMs: HANDLER_TIMEOUT_MS },
  );
  return { closeTab, finish, host };
}

describe('terminating an agent run from its monitor', () => {
  it('does not charge slow host cleanup to the plugin or close its monitor', async () => {
    const fixture = setupMonitorTermination(SLOW_TERMINATION_CLEANUP_MS);

    await expect(fixture.host.intent('agent-monitor', 'terminate', null)).resolves.toBeNull();

    expect(fixture.finish).toHaveBeenCalledWith('run-1', 'terminated');
    expect(fixture.host.statusFor('agent-monitor')).toMatchObject({ state: 'active' });
    expect(fixture.closeTab).not.toHaveBeenCalled();
  }, 10_000);

  it('rejects termination when the monitor has no available bound run', async () => {
    const fixture = setupMonitorTermination(0, false);

    await expect(fixture.host.intent('agent-monitor', 'terminate', null))
      .rejects.toThrow('agent run is no longer available');

    expect(fixture.finish).not.toHaveBeenCalled();
    expect(fixture.host.statusFor('agent-monitor')).toMatchObject({ state: 'active' });
    expect(fixture.closeTab).not.toHaveBeenCalled();
  });
});
