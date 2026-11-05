import { afterEach, describe, expect, it } from 'vitest';
import { createControllerTestProject } from '../../controller/test-project.js';
import type { AgentSnapshot } from '../../agent/types.js';
import { seedRootTab } from '../../tab/root-tab-test-fixture.js';

const snapshot: AgentSnapshot = Object.freeze({ taskPath: '/task.md', taskText: 'work', skills: [], grants: [] });

describe('agent monitor plugin', () => {
  const project = createControllerTestProject();

  afterEach(async () => {
    await project.dispose();
  });

  it('terminates only the local run bound to the requesting monitor tab', async () => {
    const controller = project.create();
    const { managers } = controller;
    const caller = managers.agent.captureCaller(seedRootTab(managers.tab));
    const first = managers.agent.create({ caller, snapshot });
    const second = managers.agent.create({ caller, snapshot });
    managers.tab.openPluginTab('agent-monitor', 'agent-monitor', first.id, 1, caller.label, () => ({
      title: 'Agent: task.md', payload: { runId: first.id },
    }));
    const monitor = managers.tab.pluginTabByInstanceKey('agent-monitor', first.id);
    if (!monitor) throw new Error('monitor tab missing');
    monitor.plugin.agentRunId = first.id;
    managers.agent.attachMonitor(first.id, monitor.label);

    await managers.plugins.intent(monitor.label, 'terminate', { runId: second.id });

    expect(first.abortController.signal.aborted).toBe(true);
    expect(second.abortController.signal.aborted).toBe(false);
    expect(managers.agent.runs.has(second.id)).toBe(true);
    await managers.agent.finish(second.id, 'completed');
  });

  it('detaches monitoring after client failure without ending the run', async () => {
    const controller = project.create();
    const { managers } = controller;
    const caller = managers.agent.captureCaller(seedRootTab(managers.tab));
    const run = managers.agent.create({ caller, snapshot });
    managers.tab.openPluginTab('agent-monitor', 'agent-monitor', run.id, 1, caller.label, () => ({
      title: 'Agent: task.md', payload: { runId: run.id },
    }));
    const monitor = managers.tab.pluginTabByInstanceKey('agent-monitor', run.id);
    if (!monitor) throw new Error('monitor tab missing');
    monitor.plugin.agentRunId = run.id;
    managers.agent.attachMonitor(run.id, monitor.label);

    managers.plugins.clientFailed(monitor.label, 'render failed');

    expect(managers.tab.byLabel(monitor.label)).toBeUndefined();
    expect(run.monitorIds.size).toBe(0);
    expect(run.outcome).toBeUndefined();
    expect(run.abortController.signal.aborted).toBe(false);
    await managers.agent.finish(run.id, 'completed');
  });
});
