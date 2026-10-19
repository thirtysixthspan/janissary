import { AGENT_MONITOR_PLUGIN_ID, isAgentMonitorPayload } from '@shared/plugins/agent-monitor/shared';
import type { ServerEvent, StateEvent } from '@shared/protocol';

type AgentRunUpdatedEvent = Extract<ServerEvent, { t: 'agent-run-updated' }>;

export function mergeAgentRunRevision(current: StateEvent, event: AgentRunUpdatedEvent): StateEvent {
  const tabs = current.tabs.map((tab) => {
    if (tab.label !== event.tab || tab.plugin?.id !== AGENT_MONITOR_PLUGIN_ID
      || !isAgentMonitorPayload(tab.plugin.payload)
      || tab.plugin.payload.runId !== event.view.id
      || (tab.agentRun?.id === event.view.id && tab.agentRun.revision >= event.view.revision)) return tab;
    return { ...tab, agentRun: event.view };
  });
  return { ...current, tabs };
}
