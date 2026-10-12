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
  skills: readonly Readonly<{ name: string; path: string; instructions: string }>[];
  grants: readonly string[];
}>;

export type AgentResolutionOptions = Readonly<{
  workspaceDir: string;
  installationDir: string;
}>;
