import { shellQuote } from '../shell/quote.js';
import { MCP_ENV } from '../mcp/environment.js';

const SERVER_NAME = 'janissary';
const { url: URL_VAR, token: TOKEN_VAR } = MCP_ENV;
const WEEK_MS = 604_800_000;
const WEEK_SECONDS = 604_800;

function claudeArgs(): string {
  const config = {
    mcpServers: {
      [SERVER_NAME]: {
        type: 'http',
        url: `\${${URL_VAR}}`,
        headers: { Authorization: `Bearer \${${TOKEN_VAR}}` },
        timeout: WEEK_MS,
      },
    },
  };
  return `--mcp-config ${shellQuote(JSON.stringify(config))}`;
}

function codexArgs(): string {
  return [
    `-c "mcp_servers.${SERVER_NAME}.url=$${URL_VAR}"`,
    `-c ${shellQuote(`mcp_servers.${SERVER_NAME}.bearer_token_env_var=${TOKEN_VAR}`)}`,
    `-c ${shellQuote(`mcp_servers.${SERVER_NAME}.tool_timeout_sec=${WEEK_SECONDS}`)}`,
  ].join(' ');
}

function opencodeArgs(): string {
  const config = {
    mcp: {
      servers: {
        [SERVER_NAME]: {
          type: 'remote',
          url: `{env:${URL_VAR}}`,
          headers: { Authorization: `Bearer {env:${TOKEN_VAR}}` },
          oauth: false,
          timeout: { execution: WEEK_MS },
        },
      },
    },
  };
  return `OPENCODE_CONFIG_CONTENT=${shellQuote(JSON.stringify(config))}`;
}

export function mcpArgs(name: string): string {
  if (name === 'claude') return claudeArgs();
  if (name === 'codex') return codexArgs();
  return opencodeArgs();
}
