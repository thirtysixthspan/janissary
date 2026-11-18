import type { AgentAcpCaller, AgentRun } from './run.js';

export type AgentWorkspace = Readonly<{
  dir: string;
  ready: Promise<void>;
  cancel(): void;
  release(): Promise<void>;
}>;

export type LocalAgentRunOptions = Readonly<{
  workspaceName?: string;
  fresh?: boolean;
  subagentRole?: string;
  acpCaller?: AgentAcpCaller;
}>;

export type LocalAgentRunStart = Readonly<{
  run: AgentRun;
  workspace: AgentWorkspace;
}>;
