import type { ScheduleEntry } from '../schedule/types.js';

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
  offline?: boolean;
  schedule?: ScheduleEntry[];
  title?: string;
};

export type AgentCommand = {
  name: string;
  workspace: boolean;
  // `--offline`: adds a network-deny rule to the tab's sandbox profile (workspaced tabs only —
  // see sandbox.ts). Ignored (but still parsed and stored) when the tab isn't workspaced.
  offline: boolean;
};
