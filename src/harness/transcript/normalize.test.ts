import { describe, it, expect } from 'vitest';
import { normalizeClaudeRecord, normalizeCodexRecord, normalizeOpencodePart, type ToolNames } from './normalize.js';

function names(): ToolNames {
  return new Map<string, string>();
}

describe('normalizeClaudeRecord', () => {
  it('renders a user message as an actor line', () => {
    const record = { type: 'user', message: { role: 'user', content: 'explore the repo' } };
    expect(normalizeClaudeRecord(record, names())).toBe('user: explore the repo');
  });

  it('renders assistant text and a tool use, then names the result from the call', () => {
    const toolNames = names();
    const call = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'reading it now' },
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/a.ts' } },
        ],
      },
    };
    expect(normalizeClaudeRecord(call, toolNames)).toBe(
      'assistant: reading it now\nassistant → Read({"file_path":"/a.ts"})',
    );
    const result = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'export const a = 1;' }] },
    };
    expect(normalizeClaudeRecord(result, toolNames)).toBe('Read result: export const a = 1;');
  });

  it('falls back to an unnamed tool when the result has no matching call', () => {
    const record = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_missing', content: 'done' }] },
    };
    expect(normalizeClaudeRecord(record, names())).toBe('tool result: done');
  });

  it('renders a thinking block under the actor', () => {
    const record = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }] } };
    expect(normalizeClaudeRecord(record, names())).toBe('assistant (thinking): hmm');
  });

  it('renders a large tool result in full — truncation is the feed\'s job', () => {
    const output = 'x'.repeat(50_000);
    const record = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'none', content: output }] },
    };
    expect(normalizeClaudeRecord(record, names())?.length).toBe(output.length + 'tool result: '.length);
  });

  it('drops the record kinds that carry no conversation content', () => {
    expect(normalizeClaudeRecord({ type: 'mode', mode: 'default' }, names())).toBeUndefined();
    expect(normalizeClaudeRecord({ type: 'file-history-snapshot', snapshot: {} }, names())).toBeUndefined();
  });

  it('drops a message whose blocks all render empty', () => {
    const record = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'image', source: {} }] } };
    expect(normalizeClaudeRecord(record, names())).toBeUndefined();
  });

  // Claude writes a compaction summary as a top-level record with no `message` at all, so it has to
  // be recognised before the message lookup rather than after it.
  it('renders a compaction summary under its own actor', () => {
    expect(normalizeClaudeRecord({ type: 'summary', summary: 'Earlier: we agreed on the shape' }, names()))
      .toBe('summary: Earlier: we agreed on the shape');
  });

  it('drops a summary with nothing in it', () => {
    expect(normalizeClaudeRecord({ type: 'summary' }, names())).toBeUndefined();
    expect(normalizeClaudeRecord({ type: 'summary', summary: ' '.repeat(3) }, names())).toBeUndefined();
  });

  it('drops a record carrying no message', () => {
    expect(normalizeClaudeRecord({ type: 'assistant' }, names())).toBeUndefined();
    expect(normalizeClaudeRecord({ type: 'assistant', message: 'not a record' }, names())).toBeUndefined();
  });
});

describe('normalizeCodexRecord', () => {
  it('renders a message payload as an actor line', () => {
    const record = {
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'list the files' }] },
    };
    expect(normalizeCodexRecord(record, names())).toBe('user: list the files');
  });

  it('renders a function call and names its output from the call id', () => {
    const toolNames = names();
    const call = {
      type: 'response_item',
      payload: { type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '{"command":"ls"}' },
    };
    expect(normalizeCodexRecord(call, toolNames)).toBe('assistant → shell({"command":"ls"})');
    const output = { type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_1', output: 'a.ts' } };
    expect(normalizeCodexRecord(output, toolNames)).toBe('shell result: a.ts');
  });

  it('drops the session-level bookkeeping records', () => {
    expect(normalizeCodexRecord({ type: 'session_meta', payload: { cwd: '/project' } }, names())).toBeUndefined();
    expect(normalizeCodexRecord({ type: 'turn_context', payload: { cwd: '/project' } }, names())).toBeUndefined();
  });

  // A rollout line that is not bookkeeping still has to carry a payload record; one that does not is
  // a shape this version does not recognise, and renders to nothing rather than to a guess.
  it('drops a line carrying no payload record', () => {
    expect(normalizeCodexRecord({ type: 'response_item' }, names())).toBeUndefined();
    expect(normalizeCodexRecord({ type: 'response_item', payload: 'not a record' }, names())).toBeUndefined();
  });

  it('renders a reasoning payload as the assistant thinking', () => {
    const record = {
      type: 'response_item',
      payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'weighing two options' }] },
    };
    expect(normalizeCodexRecord(record, names())).toContain('weighing two options');
  });

  it('drops a payload kind it does not render', () => {
    const record = { type: 'response_item', payload: { type: 'web_search_call', query: 'x' } };
    expect(normalizeCodexRecord(record, names())).toBeUndefined();
  });
});

describe('normalizeOpencodePart', () => {
  it('renders a text part as an actor line', () => {
    expect(normalizeOpencodePart({ type: 'text', text: 'hello' }, 'assistant')).toBe('assistant: hello');
  });

  it('renders a tool part as the call and its result together', () => {
    const part = { type: 'tool', tool: 'bash', state: { input: { command: 'ls' }, output: 'a.ts' } };
    expect(normalizeOpencodePart(part, 'assistant')).toBe('assistant → bash({"command":"ls"})\nbash result: a.ts');
  });

  it('renders a tool part still running as the call alone', () => {
    const part = { type: 'tool', tool: 'bash', state: { input: { command: 'ls' } } };
    expect(normalizeOpencodePart(part, 'assistant')).toBe('assistant → bash({"command":"ls"})');
  });

  it('drops a part kind it does not render', () => {
    expect(normalizeOpencodePart({ type: 'step-start' }, 'assistant')).toBeUndefined();
  });

  it('renders a reasoning part under the role that owns it, marked as thinking', () => {
    expect(normalizeOpencodePart({ type: 'reasoning', text: 'considering the tradeoff' }, 'assistant'))
      .toContain('considering the tradeoff');
  });
});
