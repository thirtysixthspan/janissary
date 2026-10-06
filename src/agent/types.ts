import type { RemoteAddress } from '../remote/address.js';

export type AgentCommand = {
  name: string;
  workspace: boolean;
  // `on <address>`: run this agent's shell on another host over one ssh session. Implies
  // `workspace`. `remoteError` carries the address's own rejection message when the clause is
  // present but unusable, so the caller reports it instead of launching locally.
  remote?: RemoteAddress;
  remoteError?: string;
  // `--offline`: adds a network-deny rule to the tab's sandbox profile (workspaced tabs only —
  // see src/sandbox/index.ts). Ignored (but still parsed and stored) when the tab isn't workspaced.
  offline: boolean;
};
