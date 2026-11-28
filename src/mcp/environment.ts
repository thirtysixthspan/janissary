export const MCP_ENV = {
  tab: 'JANISSARY_TAB',
  url: 'JANISSARY_MCP_URL',
  token: 'JANISSARY_MCP_TOKEN',
};

export function withoutMcpEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const filtered = { ...env };
  for (const variable of Object.values(MCP_ENV)) delete filtered[variable];
  return filtered;
}
