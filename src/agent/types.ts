import type { ScheduleEntry } from '../schedule/types.js';
import type { RemoteAddress } from '../remote/address.js';

export type AgentState = {
  name: string;
  dotColor: string;
  active: boolean;
  number?: number;
  focus?: boolean;
  group?: number;
  groupColor?: string;
  cmdHistory?: string[];
  log?: { input: string; output: string; running?: boolean }[];
  cwd?: string;
  context?: string[];
  commandQueue?: string[];
  workspaceDir?: string;
  // The `on <address>` token of a tab running on another host. Present only in the profile-entry
  // form of this shape — a remote agent tab is never written to the state directory, since its
  // workspace is deleted when its channel dies and its cwd does not exist on this machine.
  remote?: string;
  offline?: boolean;
  schedule?: ScheduleEntry[];
  title?: string;
};

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
  // `--model <model-id>`: the model this tab's ACP session runs on, validated by the caller against
  // the harness catalog's opencode list. Absent when the flag was not given, which leaves the tab on
  // whatever `AcpManager` resolves for itself.
  model?: string;
  // A `--model` with no value. Carried the same way as `remoteError` so the caller reports it
  // instead of launching on a missing model.
  modelError?: string;
};
