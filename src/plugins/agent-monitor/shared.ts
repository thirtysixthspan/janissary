export const AGENT_MONITOR_SCHEMA_VERSION = 1;
export const AGENT_MONITOR_PLUGIN_ID = 'agent-monitor';

export type AgentMonitorPayload = { runId: string };

export function isAgentMonitorPayload(value: unknown): value is AgentMonitorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'runId' in value && typeof value.runId === 'string' && value.runId.length > 0;
}
