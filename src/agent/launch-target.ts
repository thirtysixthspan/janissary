import type { Managers } from '../managers.js';
import type { AgentLaunch } from './types.js';
import { inheritRemoteAgentTarget, resolveRemoteAgentTarget, type RemoteAgentTarget } from './remote-target.js';

type AgentSourceTab = ReturnType<Managers['tab']['byLabel']>;

export type AgentLaunchTarget = Readonly<
  | { kind: 'local'; workspaceName?: string; sourceTab: AgentSourceTab }
  | { kind: 'remote'; target: Promise<RemoteAgentTarget>; sourceTab: AgentSourceTab }
>;

export function resolveAgentLaunchTarget(
  managers: Managers,
  launch: AgentLaunch,
  callerLabel: string,
  callerCwd: string,
  signal: AbortSignal,
): AgentLaunchTarget {
  const sourceLabel = launch.workspace ?? callerLabel;
  const sourceTab = managers.tab.byLabel(sourceLabel);
  const remoteAddress = managers.remote.addressOf(sourceLabel);
  const localWorkspaceName = launch.workspace && !launch.host
    && !managers.remote.addressOf(callerLabel) && !remoteAddress
    ? launch.workspace
    : undefined;
  if (launch.workspace && !localWorkspaceName && (!sourceTab || !remoteAddress)) {
    throw new Error(`remote workspace "${launch.workspace}" is not available.`);
  }

  if (launch.host) {
    return {
      kind: 'remote',
      target: resolveRemoteAgentTarget(managers, launch.host, sourceLabel, callerCwd, signal),
      sourceTab,
    };
  }
  if (!localWorkspaceName && (launch.workspace || remoteAddress)) {
    return { kind: 'remote', target: inheritRemoteAgentTarget(managers, sourceLabel), sourceTab };
  }
  return { kind: 'local', workspaceName: localWorkspaceName, sourceTab };
}
