import { describe, expect, it, vi } from 'vitest';
import { applyReplayProtocol, type ReplayLeg } from './replay-protocol.js';
import type { FileOperationResult } from './file-operation-result.js';
import type { BulkConflictPolicy } from '../protocol.js';

type Step = { tag: string };

type Apply = (current: ReplayLeg<string>, overwrite: boolean) => FileOperationResult;

function optionsFor(fromStack: Step[], toStack: Step[], apply: Apply, rebuild: () => void) {
  const policy: BulkConflictPolicy | undefined = undefined;
  return {
    groupItems: ['a'],
    replayItems: ['a'],
    fromStack,
    toStack,
    policy,
    rebuild,
    makeStep: (items: string[]): Step => ({ tag: items.join(',') }),
    leg: (item: string): ReplayLeg<string> => ({
      item,
      source: `/src/${item}`,
      destination: `/dst/${item}`,
      conflict: { fromRelPath: `/src/${item}`, toRelPath: `/dst/${item}` },
      failurePath: item,
    }),
    apply,
    preflight: false,
  };
}

const succeeds: Apply = () => ({ ok: true, value: undefined });

describe('applyReplayProtocol stack guard', () => {
  it('pops the source stack and rebuilds when the replayed step is still on top', () => {
    const fromStack: Step[] = [{ tag: 'original' }];
    const toStack: Step[] = [];
    const rebuild = vi.fn();

    applyReplayProtocol(optionsFor(fromStack, toStack, succeeds, rebuild));

    expect(fromStack).toEqual([]);
    expect(toStack).toEqual([{ tag: 'a' }]);
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it('leaves both stacks untouched when the source stack top changes during the replay', () => {
    const replacement: Step = { tag: 'replacement' };
    const fromStack: Step[] = [{ tag: 'original' }];
    const toStack: Step[] = [];
    const rebuild = vi.fn();
    const apply: Apply = () => {
      fromStack.pop();
      fromStack.push(replacement);
      return { ok: true, value: undefined };
    };

    const result = applyReplayProtocol(optionsFor(fromStack, toStack, apply, rebuild));

    expect(result).toEqual({ total: 1, failedPaths: [] });
    expect(fromStack).toEqual([replacement]);
    expect(toStack).toEqual([]);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('leaves the destination stack untouched when the source stack is empty', () => {
    const fromStack: Step[] = [];
    const toStack: Step[] = [];
    const rebuild = vi.fn();

    applyReplayProtocol(optionsFor(fromStack, toStack, succeeds, rebuild));

    expect(fromStack).toEqual([]);
    expect(toStack).toEqual([]);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
