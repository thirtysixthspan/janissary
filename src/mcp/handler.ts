import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { validateQuestionArgs } from './question-tool.js';
import { TOOLS, type ToolExecutor } from './tools.js';

function toolResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createHandler(executor: ToolExecutor): McpHttpHandler {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'janissary', version: '1.0.0' });
    for (const definition of TOOLS) {
      server.registerTool(
        definition.name,
        { description: definition.description, inputSchema: definition.inputSchema },
        async (args, ctx) => {
          const validated = validateQuestionArgs(args as Record<string, unknown>);
          if ('error' in validated) return toolResult(validated.error, true);
          const result = await executor(definition.name, validated, ctx.mcpReq.signal);
          return toolResult(result.text, result.isError);
        },
      );
    }
    return server;
  });
}
