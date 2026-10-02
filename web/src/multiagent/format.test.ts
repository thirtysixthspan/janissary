import { describe, expect, it } from 'vitest';
import type { MultiAgentMemberView } from '@shared/protocol';
import { runSummary, stateWord } from './format';

const member = (overrides: Partial<MultiAgentMemberView> = {}): MultiAgentMemberView => ({
  index: 0, model: 'opencode/a', state: 'running', ...overrides,
});

describe('stateWord', () => {
  it('reads each state as a word', () => {
    expect(stateWord('cloning')).toBe('cloning its workspace');
    expect(stateWord('running')).toBe('working');
    expect(stateWord('answered')).toBe('answered');
    expect(stateWord('failed')).toBe('failed');
  });
});

describe('runSummary', () => {
  it('counts the answered members', () => {
    expect(runSummary([member({ state: 'answered' }), member({ index: 1, state: 'running' })], 0))
      .toBe('1 of 2 answered');
  });

  it('names the clones still in flight', () => {
    expect(runSummary([member({ state: 'cloning' })], 1)).toBe('0 of 1 answered · 1 cloning');
  });

  it('counts a failed member in the total rather than hiding it', () => {
    expect(runSummary([member({ state: 'answered' }), member({ index: 1, state: 'failed' })], 0))
      .toBe('1 of 2 answered');
  });
});
