import type { TabPluginClientCapabilities } from '../api';
import type { AgentMonitorPayload } from '@shared/plugins/agent-monitor/shared';
import type { AgentRunView } from '../api';
import { AgentMonitor } from './view';
import './style.css';

export { isAgentMonitorPayload as isPayload } from '@shared/plugins/agent-monitor/shared';

export default function AgentMonitorPlugin({
  payload: _payload,
  capabilities,
  agentRun,
}: {
  payload: AgentMonitorPayload;
  capabilities: TabPluginClientCapabilities;
  agentRun?: AgentRunView;
}) {
  return <AgentMonitor run={agentRun} capabilities={capabilities} />;
}
