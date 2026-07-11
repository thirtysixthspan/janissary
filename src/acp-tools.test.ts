import { describe, it, expect } from 'vitest';
import type { ToolCallUpdate, PermissionOption } from '@agentclientprotocol/sdk';
import { classifyTool, decidePermission } from './acp-tools.js';

function toolCall(overrides: Partial<ToolCallUpdate>): ToolCallUpdate {
  return { toolCallId: 't1', ...overrides };
}

const allowOnce: PermissionOption = { optionId: 'once', name: 'Allow once', kind: 'allow_once' };
const allowAlways: PermissionOption = { optionId: 'always', name: 'Allow always', kind: 'allow_always' };
const rejectOnce: PermissionOption = { optionId: 'no', name: 'Reject', kind: 'reject_once' };

describe('classifyTool', () => {
  it('classifies kind "fetch" as web_fetch', () => {
    expect(classifyTool(toolCall({ kind: 'fetch' }))).toBe('web_fetch');
  });

  it('classifies a web-fetch title even when kind is unset', () => {
    expect(classifyTool(toolCall({ title: 'WebFetch' }))).toBe('web_fetch');
    expect(classifyTool(toolCall({ title: 'web fetch' }))).toBe('web_fetch');
  });

  it('classifies a web-search title as web_search', () => {
    expect(classifyTool(toolCall({ title: 'Web Search', kind: 'search' }))).toBe('web_search');
  });

  it('does NOT map a bare kind "search" (a file search) to web_search', () => {
    expect(classifyTool(toolCall({ kind: 'search', title: 'Search files' }))).toBeNull();
  });

  it('returns null for an unrelated tool', () => {
    expect(classifyTool(toolCall({ kind: 'execute', title: 'Run shell' }))).toBeNull();
    expect(classifyTool(toolCall({}))).toBeNull();
  });
});

describe('decidePermission', () => {
  it('denies when the allowlist is undefined (tool-less default)', () => {
    expect(decidePermission(undefined, toolCall({ kind: 'fetch' }), [allowOnce])).toEqual({ outcome: 'cancelled' });
  });

  it('denies when the allowlist is empty', () => {
    expect(decidePermission([], toolCall({ kind: 'fetch' }), [allowOnce])).toEqual({ outcome: 'cancelled' });
  });

  it('selects the allow_once option for an allowed classified tool', () => {
    expect(decidePermission(['web_fetch'], toolCall({ kind: 'fetch' }), [rejectOnce, allowOnce, allowAlways]))
      .toEqual({ outcome: 'selected', optionId: 'once' });
  });

  it('falls back to allow_always when allow_once is not offered', () => {
    expect(decidePermission(['web_fetch'], toolCall({ kind: 'fetch' }), [rejectOnce, allowAlways]))
      .toEqual({ outcome: 'selected', optionId: 'always' });
  });

  it('denies a classified tool that is not in the allowlist', () => {
    expect(decidePermission(['web_search'], toolCall({ kind: 'fetch' }), [allowOnce])).toEqual({ outcome: 'cancelled' });
  });

  it('denies an unclassifiable tool even when tools are allowed', () => {
    expect(decidePermission(['web_search', 'web_fetch'], toolCall({ kind: 'execute', title: 'shell' }), [allowOnce]))
      .toEqual({ outcome: 'cancelled' });
  });

  it('denies when no allow option is offered', () => {
    expect(decidePermission(['web_fetch'], toolCall({ kind: 'fetch' }), [rejectOnce])).toEqual({ outcome: 'cancelled' });
  });
});
