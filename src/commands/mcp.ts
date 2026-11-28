import type { Command } from './types.js';
import type { McpStatus } from '../mcp/manager.js';
import { appendCommandOutput } from '../command/append.js';

function render(status: McpStatus): string {
  if (status.status === 'running') {
    return [
      'status: running',
      `url: ${status.url}`,
      `port: ${status.port}`,
      'tools: question',
    ].join('\n');
  }
  return `status: not running\nreason: ${status.reason}`;
}

export const command: Command = {
  name: 'mcp',
  match: (command_) => command_.toLowerCase() === 'mcp',
  samples: ['mcp'],
  run: (command_, tab, managers, invocation) => {
    appendCommandOutput(managers, tab.label, { input: command_, output: render(managers.mcp.status()) }, invocation);
  },
};
