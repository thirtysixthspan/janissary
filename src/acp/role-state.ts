import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { TabRuntime } from '../tab/types.js';
import type { SubagentDelivery } from '../subagent/messages.js';

export type AcpRoleRuntime = {
  prompt?: AcpPendingPrompt;
  recordId?: string;
  recordName?: string;
  pendingSubagentMessages?: SubagentDelivery[];
  subagentDeliveryInFlight?: symbol;
  subagentDrainScheduled?: symbol;
};

export function acpRoleRuntime(runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE): AcpRoleRuntime {
  const states = runtime.acpRoles ??= {};
  return states[role] ??= {};
}

export function existingAcpRoleRuntime(runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE): AcpRoleRuntime | undefined {
  return runtime.acpRoles?.[role];
}
