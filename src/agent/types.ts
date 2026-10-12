export type AgentLaunch = Readonly<{
  host?: string;
  inTab: boolean;
  group?: string;
  workspace?: string;
  skills: readonly string[];
  model?: string;
  effort?: string;
  task: string;
  parameters: string;
}>;

export type AgentSnapshot = Readonly<{
  taskPath: string;
  taskText: string;
  skills: readonly Readonly<{ source: 'project' | 'janissary'; name: string; path: string; instructions: string }>[];
  grants: readonly string[];
}>;

export type AgentRunView = Readonly<{
  id: string;
  revision: number;
  task: string;
  command: string;
  model: string;
  effort: string;
  host: 'Local';
  workspace: string;
  status: 'Provisioning' | 'Running' | 'Waiting for answer' | 'Cleaning up' | 'Completed' | 'Failed' | 'Terminated';
  activity: readonly Readonly<{ id: number; kind: string; text: string }>[];
  response?: string;
}>;

export type AgentResolutionOptions = Readonly<{
  workspaceDir: string;
  installationDir: string;
}>;
