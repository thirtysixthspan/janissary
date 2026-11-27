import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler.js';
import { QUESTION_ERROR } from './question-tool.js';
import { TOOLS, type ToolExecutor } from './tools.js';

type ToolCallback = (
  args: Record<string, unknown>,
  ctx: { mcpReq: { signal: AbortSignal } },
) => Promise<{ content: { type: string; text: string }[]; isError: boolean }>;

const { registerToolSpy } = vi.hoisted(() => ({ registerToolSpy: vi.fn() }));

vi.mock('@modelcontextprotocol/server', () => ({
  createMcpHandler: (factory: () => unknown) => {
    factory();
    return 'handler';
  },
  McpServer: class {
    registerTool = registerToolSpy;
  },
}));

function capturedCallback(executor: ToolExecutor): ToolCallback {
  vi.clearAllMocks();
  createHandler(executor);
  expect(registerToolSpy).toHaveBeenCalledOnce();
  const call = registerToolSpy.mock.calls[0];
  expect(call?.[0]).toBe(TOOLS[0]?.name);
  expect(call?.[1]).toEqual({ description: TOOLS[0]?.description, inputSchema: TOOLS[0]?.inputSchema });
  return call?.[2] as ToolCallback;
}

function context(signal: AbortSignal): { mcpReq: { signal: AbortSignal } } {
  return { mcpReq: { signal } };
}

describe('createHandler', () => {
  it('registers the question tool and returns a non-error text result for a valid question', async () => {
    const executor = vi.fn<ToolExecutor>(async () => ({ text: 'Which port?', isError: false }));

    const result = await capturedCallback(executor)(
      { tab: 'build', kind: 'ask', question: 'Which port?' },
      context(new AbortController().signal),
    );

    expect(result).toEqual({ content: [{ type: 'text', text: 'Which port?' }], isError: false });
    expect(executor.mock.calls[0]?.[0]).toBe('question');
    expect(executor.mock.calls[0]?.[1]).toEqual({ tab: 'build', kind: 'ask', question: 'Which port?' });
  });

  it('maps an executor-reported error to an error tool result', async () => {
    const executor = vi.fn<ToolExecutor>(async () => ({ text: 'Denied', isError: true }));

    const result = await capturedCallback(executor)(
      { tab: 'build', kind: 'ask', question: 'Proceed?' },
      context(new AbortController().signal),
    );

    expect(result).toEqual({ content: [{ type: 'text', text: 'Denied' }], isError: true });
    expect(executor).toHaveBeenCalledOnce();
    expect(executor.mock.calls[0]?.[0]).toBe('question');
  });

  it.each([
    { label: 'invalid kind', args: { kind: 'maybe', question: 'Deploy?' }, message: QUESTION_ERROR.invalidKind },
    { label: 'empty question', args: { kind: 'ask', question: ' '.repeat(3) }, message: QUESTION_ERROR.emptyQuestion },
    { label: 'approve without options', args: { kind: 'approve', question: 'Deploy?', options: [] }, message: QUESTION_ERROR.missingOptions },
  ])('maps $label to an exact error tool result without calling the executor', async ({ args, message }) => {
    const executor = vi.fn<ToolExecutor>(async () => ({ text: 'unexpected', isError: false }));

    const result = await capturedCallback(executor)(
      { tab: 'build', ...args },
      context(new AbortController().signal),
    );

    expect(result).toEqual({ content: [{ type: 'text', text: message }], isError: true });
    expect(executor).not.toHaveBeenCalled();
  });

  it('forwards the request abort signal to the executor', async () => {
    const signal = new AbortController().signal;
    const executor = vi.fn<ToolExecutor>(async () => ({ text: 'ok', isError: false }));

    await capturedCallback(executor)(
      { tab: 'build', kind: 'ask', question: 'Proceed?' },
      context(signal),
    );

    expect(executor.mock.calls[0]?.[2]).toBe(signal);
  });
});
