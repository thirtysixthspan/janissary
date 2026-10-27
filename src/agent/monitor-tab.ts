import type { Managers } from '../managers.js';
import type { TabGroup } from '../tab/groups.js';

export function openAgentMonitorTab(
  runId: string,
  taskPath: string,
  label: string,
  group: TabGroup | undefined,
  managers: Managers,
): void {
  const monitorPlugin = managers.plugins.declarations.find((declaration) => declaration.agentMonitor === true);
  if (!monitorPlugin) throw new Error('Agent: no monitoring plugin is available.');
  const taskName = taskPath.split('/').at(-1) ?? taskPath;
  managers.tab.openPluginTab(monitorPlugin.id, monitorPlugin.tabLabelPrefix, runId,
    monitorPlugin.payloadSchemaVersion, label, () => ({
    title: `Agent: ${taskName}`,
    payload: { runId },
  }), group ? { group: group.name } : undefined);
  const monitor = managers.tab.pluginTabByInstanceKey(monitorPlugin.id, runId);
  if (!monitor) throw new Error('Agent: could not open monitoring tab.');
  monitor.plugin.agentRunId = runId;
  managers.agent.attachMonitor(runId, monitor.label);
}
