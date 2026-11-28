import type { Managers } from '../managers.js';
import { createLocalExecutor, MCP_CHANNEL_CLOSED } from '../mcp/executor.js';
import { validateQuestionArgs, type QuestionArgs } from '../mcp/question-tool.js';
import { TOOLS, unknownToolError, type ToolResult } from '../mcp/tools.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

type McpCallFrame = Extract<ServerFrame, { type: 'mcp-call' }>;
type McpCancelFrame = Extract<ServerFrame, { type: 'mcp-cancel' }>;

type Pending = { result?: ToolResult; controller?: AbortController };

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
      const args = decodeCall(frame);
      if ('error' in args) {
        answer(frame.call, { text: args.error, isError: true });
        return;
      }
      const controller = new AbortController();
      const entry: Pending = { controller };
      pending.set(frame.call, entry);
      const settle = (result: ToolResult): void => {
        if (pending.get(frame.call) !== entry) return;
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
    clear(): void {
      const entries = [...pending.values()].toReversed();
      pending.clear();
      for (const entry of entries) entry.controller?.abort(MCP_CHANNEL_CLOSED);
    },
  };
}
