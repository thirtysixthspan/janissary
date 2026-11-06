import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { TabRuntime } from '../tab/types.js';

export type AcpRoleRuntime = { prompt?: AcpPendingPrompt; recordId?: string };

export function acpRoleRuntime(runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE): AcpRoleRuntime {
  const states = runtime.acpRoles ??= {};
  return states[role] ??= {};
}

export function existingAcpRoleRuntime(runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE): AcpRoleRuntime | undefined {
  return runtime.acpRoles?.[role];
}
