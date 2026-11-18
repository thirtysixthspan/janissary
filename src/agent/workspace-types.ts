import type { AgentRun } from './run.js';

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
}>;

export type LocalAgentRunStart = Readonly<{
  run: AgentRun;
  workspace: AgentWorkspace;
}>;
