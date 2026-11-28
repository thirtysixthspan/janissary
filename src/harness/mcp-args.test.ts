import { describe, it, expect } from 'vitest';
import { mcpArgs } from './mcp-args.js';
import { buildHarnessCommand } from './index.js';

const SECRET = 'sk-janissary-literal-token';

function quotedJson(fragment: string, prefix: string): Record<string, unknown> {
  const value = fragment.slice(prefix.length);
  expect(value.startsWith("'")).toBe(true);
  expect(value.endsWith("'")).toBe(true);
  return JSON.parse(value.slice(1, -1)) as Record<string, unknown>;
}

describe.each([
  ['claude', '604800000'],
  ['codex', '604800'],
  ['opencode', '604800000'],
])('mcpArgs %s', (name, timeout) => {
  const fragment = mcpArgs(name);

  it('names the server and never carries a literal token', () => {
    expect(fragment).toContain('janissary');
    expect(fragment).toContain('JANISSARY_MCP_TOKEN');
    expect(fragment).not.toContain(SECRET);
  });

  it('carries the seven-day timeout', () => {
    expect(fragment).toContain(timeout);
  });

  it('never disables the user\'s own servers', () => {
    expect(fragment).not.toContain('--strict-mcp-config');
  });
});

describe('mcpArgs — claude', () => {
  it('passes an inline http server config with environment references', () => {
    const fragment = mcpArgs('claude');
    expect(fragment.startsWith('--mcp-config ')).toBe(true);
    const config = quotedJson(fragment, '--mcp-config ');
    const server = (config.mcpServers as Record<string, Record<string, unknown>>).janissary;
    expect(server).toMatchObject({
      type: 'http',
      url: '${JANISSARY_MCP_URL}',
      headers: { Authorization: 'Bearer ${JANISSARY_MCP_TOKEN}' },
      timeout: 604_800_000,
    });
    expect(server).not.toHaveProperty('Authorization', SECRET);
  });
});

describe('mcpArgs — codex', () => {
  it('sets the URL, token variable and tool timeout as separate dotted overrides', () => {
    const fragment = mcpArgs('codex');
    expect(fragment).toContain(`-c "mcp_servers.janissary.url=$JANISSARY_MCP_URL"`);
    expect(fragment).toContain(`-c 'mcp_servers.janissary.bearer_token_env_var=JANISSARY_MCP_TOKEN'`);
    expect(fragment).toContain(`-c 'mcp_servers.janissary.tool_timeout_sec=604800'`);
  });
});

describe('mcpArgs — opencode', () => {
  it('passes an inline config layer with oauth off and a seven-day execution timeout', () => {
    const fragment = mcpArgs('opencode');
    expect(fragment.startsWith('OPENCODE_CONFIG_CONTENT=')).toBe(true);
    const config = quotedJson(fragment, 'OPENCODE_CONFIG_CONTENT=');
    const server = (config.mcp as Record<string, Record<string, Record<string, unknown>>>).servers.janissary;
    expect(server).toMatchObject({
      type: 'remote',
      url: '{env:JANISSARY_MCP_URL}',
      headers: { Authorization: 'Bearer {env:JANISSARY_MCP_TOKEN}' },
      oauth: false,
      timeout: { execution: 604_800_000 },
    });
  });
});

describe('buildHarnessCommand — mcp', () => {
  it.each(['claude', 'codex', 'opencode'])('appends the fragment for %s when requested', (name) => {
    expect(buildHarnessCommand(name, undefined, undefined, true)).toContain(mcpArgs(name));
  });

  it.each(['claude', 'codex', 'opencode'])('leaves the launch unchanged when not requested (%s)', (name) => {
    expect(buildHarnessCommand(name, undefined, undefined, false)).toBe(buildHarnessCommand(name));
  });
});
