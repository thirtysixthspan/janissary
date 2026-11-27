import type { Managers } from '../managers.js';
import { createLocalExecutor } from '../mcp/executor.js';
import type { ToolResult } from '../mcp/tools.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type McpCallFrame = Extract<ServerFrame, { type: 'mcp-call' }>;

type Pending = { result?: ToolResult };

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
      const entry: Pending = {};
      pending.set(frame.call, entry);
      const args = JSON.parse(frame.args) as Record<string, unknown>;
      const settle = (result: ToolResult): void => {
        entry.result = result;
        answer(frame.call, result);
      };
      void execute(frame.tool, args, new AbortController().signal).then(settle, (error: unknown) => {
        settle({ text: error instanceof Error ? error.message : String(error), isError: true });
      });
    },
    clear(): void { pending.clear(); },
  };
}
