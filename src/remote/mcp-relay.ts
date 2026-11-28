import type { Managers } from '../managers.js';
import { createLocalExecutor, MCP_CHANNEL_CLOSED, type RestoredMcpTab } from '../mcp/executor.js';
import { validateQuestionArgs, type QuestionArgs } from '../mcp/question-tool.js';
import { TOOLS, unknownToolError, type ToolResult } from '../mcp/tools.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type McpCallFrame = Extract<ServerFrame, { type: 'mcp-call' }>;
type McpCancelFrame = Extract<ServerFrame, { type: 'mcp-cancel' }>;

function decodeCall(frame: McpCallFrame): QuestionArgs | { error: string } {
  const malformed = { error: `Malformed MCP arguments: ${frame.args}` };
  let args: unknown;
  try {
    args = JSON.parse(frame.args);
  } catch {
    return malformed;
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return malformed;
  if (TOOLS.every((tool) => tool.name !== frame.tool)) return { error: unknownToolError(frame.tool) };
  return validateQuestionArgs(args as Record<string, unknown>);
}

export function createMcpRelay(managers: Managers, send: (frame: ClientFrame) => void, restoredTab?: RestoredMcpTab) {
  const execute = createLocalExecutor(managers, restoredTab);
  const pending = new Map<string, AbortController>();
  const settled = new Map<string, ToolResult>();

  const answer = (call: string, result: ToolResult): void => {
    send({ type: 'mcp-result', call, text: result.text, isError: result.isError });
  };

  return {
    handle(frame: McpCallFrame): void {
      const result = settled.get(frame.call);
      if (result) { answer(frame.call, result); return; }
      if (pending.has(frame.call)) return;
      const args = decodeCall(frame);
      if ('error' in args) {
        answer(frame.call, { text: args.error, isError: true });
        return;
      }
      const controller = new AbortController();
      pending.set(frame.call, controller);
      const settle = (result: ToolResult): void => {
        if (pending.get(frame.call) !== controller) return;
        pending.delete(frame.call);
        settled.set(frame.call, result);
        answer(frame.call, result);
      };
      void execute(frame.tool, args, controller.signal).then(settle, (error: unknown) => {
        settle({ text: error instanceof Error ? error.message : String(error), isError: true });
      });
    },
    cancel(frame: McpCancelFrame): void {
      if (frame.received) settled.delete(frame.call);
      else pending.get(frame.call)?.abort();
    },
    reconcile(replayable: readonly string[]): void {
      const candidates = new Set(replayable);
      for (const call of settled.keys()) {
        if (!candidates.has(call)) settled.delete(call);
      }
    },
    clear(): void {
      const controllers = [...pending.values()].toReversed();
      pending.clear();
      settled.clear();
      for (const controller of controllers) controller.abort(MCP_CHANNEL_CLOSED);
    },
  };
}
