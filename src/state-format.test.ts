import { describe, it, expect } from 'vitest';
import { formatState } from './state-format.js';

describe('formatState', () => {
  it('returns "No state file found" message when state is null', () => {
    const result = formatState('testLabel', null);
    expect(result).toBe('No state file found for "testLabel".');
  });

  it('formats a simple state object with primitive values', () => {
    const state = {
      name: 'test-agent',
      count: 42,
      active: true,
    };
    const result = formatState('myAgent', state);
    expect(result).toContain('name:');
    expect(result).toContain('test-agent');
    expect(result).toContain('count:');
    expect(result).toContain('42');
    expect(result).toContain('active:');
    expect(result).toContain('true');
  });

  it('formats state with nested objects', () => {
    const state = {
      config: {
        timeout: 30,
        retries: 3,
      },
    };
    const result = formatState('myAgent', state);
    expect(result).toContain('config:');
    expect(result).toContain('timeout:');
    expect(result).toContain('retries:');
  });

  it('formats state with array values', () => {
    const state = {
      items: ['a', 'b', 'c'],
    };
    const result = formatState('myAgent', state);
    expect(result).toContain('items:');
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('formats state with array of objects', () => {
    const state = {
      history: [
        { input: 'cmd1', output: 'result1' },
        { input: 'cmd2', output: 'result2' },
      ],
    };
    const result = formatState('myAgent', state);
    expect(result).toContain('> cmd1');
    expect(result).toContain('result1');
    expect(result).toContain('> cmd2');
    expect(result).toContain('result2');
  });

  it('truncates large objects with omission message', () => {
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      largeObj[`field${i}`] = i;
    }
    const state = { data: largeObj };
    const result = formatState('myAgent', state);
    expect(result).toContain('...');
    expect(result).toContain('lines omitted');
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
    expect(result).toContain('message:');
    expect(result).toContain('<empty>');
  });

  it('handles state with null and undefined values', () => {
    const state = {
      nullVal: null,
      undefVal: undefined,
    };
    const result = formatState('myAgent', state);
    expect(result).toContain('nullVal:');
    expect(result).toContain('<empty>');
    expect(result).toContain('undefVal:');
  });
});
