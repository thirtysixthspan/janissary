import { describe, it, expect } from 'vitest';
import { formatState } from './state-format.js';

describe('formatState', () => {
  it('returns "No state file found" message when state is null', () => {
    const result = formatState('testLabel', null);
    expect(result).toBe('No state file found for "testLabel".');
  });

  it('gives each scalar field a bold name and its value in inline code, one field per block', () => {
    const state = {
      name: 'test-agent',
      count: 42,
      active: true,
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**name**: `test-agent`\n\n**count**: `42`\n\n**active**: `true`');
  });

  it('formats nested objects in a fenced block', () => {
    const state = {
      config: {
        timeout: 30,
        retries: 3,
      },
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**config**:\n\n```\n  timeout: 30\n  retries: 3\n```');
  });

  it('formats array values in a fenced block', () => {
    const state = {
      items: ['a', 'b', 'c'],
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**items**:\n\n```\n  - "a"\n  - "b"\n  - "c"\n```');
  });

  it('keeps an entry list\'s input and output layout inside its block', () => {
    const state = {
      history: [
        { input: 'cmd1', output: 'result1' },
        { input: 'cmd2', output: 'result2' },
      ],
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**history**:\n\n```\n> cmd1\n  result1\n> cmd2\n  result2\n```');
  });

  it('truncates large objects with omission message', () => {
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      largeObj[`field${i}`] = i;
    }
    const state = { data: largeObj };
    const result = formatState('myAgent', state);
    expect(result).toContain('```\n... (10 lines omitted)\n  field10: 10');
  });

  it('handles empty state object', () => {
    const state = {};
    const result = formatState('myAgent', state);
    expect(result).toBe('');
  });

  it('handles state with empty string values', () => {
    const state = {
      message: '',
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**message**: `<empty>`');
  });

  it('handles state with null and undefined values', () => {
    const state = {
      nullVal: null,
      undefVal: undefined,
    };
    const result = formatState('myAgent', state);
    expect(result).toBe('**nullVal**: `<empty>`\n\n**undefVal**: `<empty>`');
  });

  it('puts a multi-line string in a block rather than inline code', () => {
    expect(formatState('myAgent', { title: 'one\ntwo' })).toBe('**title**:\n\n```\none\ntwo\n```');
  });

  it('fences a value with backticks so they cannot close its code early', () => {
    expect(formatState('myAgent', { title: 'a `b` c' })).toBe('**title**: ``a `b` c``');
    expect(formatState('myAgent', { cmdHistory: ['```'] })).toBe('**cmdHistory**:\n\n````\n  - "```"\n````');
  });
});
