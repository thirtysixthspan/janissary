import type { AcpSession } from './types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { TabRuntime } from '../tab/types.js';

export type PersonaRoleHooks = { onError: (message: string) => void };

export type PersonaRoleRuntime = {
  session?: AcpSession;
  hooks?: PersonaRoleHooks;
  prompt?: AcpPendingPrompt;
  recordId?: string;
  recordName?: string;
  context?: { role: 'input' | 'response'; text: string }[];
  identity?: string;
  model?: string;
};

export function personaRoleRuntime(runtime: TabRuntime, role: string): PersonaRoleRuntime {
  const states = runtime.personaRoles ??= {};
  return states[role] ??= {};
}

export function existingPersonaRoleRuntime(runtime: TabRuntime, role: string): PersonaRoleRuntime | undefined {
  return runtime.personaRoles?.[role];
}

export function forgetPersonaRole(runtime: TabRuntime, role: string): void {
  if (runtime.personaRoles) delete runtime.personaRoles[role];
}
