import { describe, expect, it, vi } from 'vitest';
import { enterScope } from './scope-ride.js';
import type { SearchScope } from './scope.js';

const remote = (ride: string, dir = '/far/clone'): SearchScope =>
  ({ kind: 'remote', dir, label: ride, display: '$workspace/clone', host: 'box', ride });
const local: SearchScope = { kind: 'local', dir: '/repo/clone', label: 'claude-2', display: '$workspace/claude-2' };
const launch: SearchScope = { kind: 'launch' };

function fake(answers: boolean[] = []) {
  const calls: string[] = [];
  const capabilities = {
    releaseRemoteWorkspace: vi.fn((key: string) => { calls.push(`release ${key}`); }),
    joinRemoteWorkspace: vi.fn((key: string, label: string) => {
      calls.push(`join ${key} ${label}`);
      return answers.shift() ?? true;
    }),
  };
  return { capabilities, calls };
}

describe('enterScope', () => {
  it('releases and then joins a remote target through its ride', () => {
    const { capabilities, calls } = fake();
    const target = remote('harness-1');
    expect(enterScope(target, launch, capabilities)).toEqual({ scope: target, joinFailed: false });
    expect(calls).toEqual(['release search', 'join search harness-1']);
  });

  it('only releases for a local or launch target', () => {
    for (const target of [local, launch]) {
      const { capabilities, calls } = fake();
      expect(enterScope(target, remote('harness-1'), capabilities)).toEqual({ scope: target, joinFailed: false });
      expect(calls).toEqual(['release search']);
    }
  });

  it('keeps a local previous scope when the join fails, without rejoining', () => {
    const { capabilities, calls } = fake([false]);
    expect(enterScope(remote('harness-1'), local, capabilities)).toEqual({ scope: local, joinFailed: true });
    expect(calls).toEqual(['release search', 'join search harness-1']);
  });

  it('rejoins a remote previous scope when the join fails', () => {
    const { capabilities, calls } = fake([false, true]);
    const previous = remote('harness-0', '/far/other');
    expect(enterScope(remote('harness-1'), previous, capabilities)).toEqual({ scope: previous, joinFailed: true });
    expect(calls).toEqual(['release search', 'join search harness-1', 'join search harness-0']);
  });

  it('falls back to launch when the remote previous scope cannot be rejoined either', () => {
    const { capabilities } = fake([false, false]);
    expect(enterScope(remote('harness-1'), remote('harness-0', '/far/other'), capabilities))
      .toEqual({ scope: launch, joinFailed: true });
  });
});
