import type { Managers } from '../managers.js';
import { createLocalExecutor } from '../mcp/executor.js';
import type { ToolResult } from '../mcp/tools.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type McpCallFrame = Extract<ServerFrame, { type: 'mcp-call' }>;
type McpCancelFrame = Extract<ServerFrame, { type: 'mcp-cancel' }>;

type Pending = { result?: ToolResult; controller?: AbortController };

export function createMcpRelay(managers: Managers, send: (frame: ClientFrame) => void) {
  const execute = createLocalExecutor(managers);
  const pending = new Map<string, Pending>();

  const answer = (call: string, result: ToolResult): void => {
    send({ type: 'mcp-result', call, text: result.text, isError: result.isError });
  };

  return {
    handle(frame: McpCallFrame): void {
      const existing = pending.get(frame.call);
      if (existing) {
        if (existing.result !== undefined) answer(frame.call, existing.result);
        return;
      }
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(frame.args) as Record<string, unknown>;
      } catch {
        answer(frame.call, { text: `Malformed MCP arguments: ${frame.args}`, isError: true });
        return;
      }
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        answer(frame.call, { text: `Malformed MCP arguments: ${frame.args}`, isError: true });
        return;
      }
      const controller = new AbortController();
      const entry: Pending = { controller };
      pending.set(frame.call, entry);
      const settle = (result: ToolResult): void => {
        entry.controller = undefined;
        entry.result = result;
        answer(frame.call, result);
      };
      void execute(frame.tool, args, controller.signal).then(settle, (error: unknown) => {
        settle({ text: error instanceof Error ? error.message : String(error), isError: true });
      });
    },
    cancel(frame: McpCancelFrame): void {
      pending.get(frame.call)?.controller?.abort();
    },
    clear(): void { pending.clear(); },
  };
}
