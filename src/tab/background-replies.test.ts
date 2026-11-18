import { describe, expect, it } from 'vitest';
import type { AcpPendingPrompt } from '../acp/prompt-state.js';
import { backgroundRepliesFor, pendingAcpReplyNamesFor } from './background-replies.js';
import { makeTab } from './index.js';

describe('backgroundRepliesFor', () => {
  it('projects the exact ask input as a line and leaves monitor replies without one', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: '/ask hello', output: 'answer', background: 'ask-lower' },
      { input: 'ASK summarize', output: 'answer', background: 'ask-upper' },
      { input: 'monitor ask now', output: 'suggestion', background: 'monitor' },
      { input: '', output: 'empty input', background: 'empty' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'ask-lower', output: 'answer', line: '/ask hello' },
      { id: 'ask-upper', output: 'answer', line: 'ASK summarize' },
      { id: 'monitor', output: 'suggestion' },
      { id: 'empty', output: 'empty input' },
    ]);
  });

  it('projects the exact tell input as a line, with or without a slash, in any case, and for a reset', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'tell hello', output: 'answer', background: 'tell' },
      { input: '/tell hello', output: 'answer', background: 'tell-slash' },
      { input: 'TELL summarize', output: 'answer', background: 'tell-upper' },
      { input: '  /TeLl   ReSeT  ', output: 'reset', background: 'tell-reset' },
      { input: 'tell-extra', output: 'answer', background: 'tell-extra' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'tell', output: 'answer', line: 'tell hello' },
      { id: 'tell-slash', output: 'answer', line: '/tell hello' },
      { id: 'tell-upper', output: 'answer', line: 'TELL summarize' },
      { id: 'tell-reset', output: 'reset', line: '  /TeLl   ReSeT  ' },
      { id: 'tell-extra', output: 'answer', line: 'tell-extra' },
    ]);
  });

  it('keeps no line for input that only resembles the ask or tell word', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'telling', output: 'reply', background: 'telling' },
      { input: 'asked', output: 'reply', background: 'asked' },
      { input: 'monitor tell now', output: 'reply', background: 'monitor-tell' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'telling', output: 'reply' },
      { id: 'asked', output: 'reply' },
      { id: 'monitor-tell', output: 'reply' },
    ]);
  });

  it('projects the answering record as record, with or without a line', () => {
    const tab = makeTab('shell', '#fff');
    const backgroundRecord = { id: 'record-1', name: 'acp:ask:shell' };
    tab.log = [
      { input: 'ask hello', output: 'answer', background: 'with-line', backgroundRecord },
      { input: 'monitor ask now', output: 'suggestion', background: 'without-line', backgroundRecord },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'with-line', output: 'answer', line: 'ask hello', record: backgroundRecord },
      { id: 'without-line', output: 'suggestion', record: backgroundRecord },
    ]);
  });

  it('adds no record key to a reply that has no answering record', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'ask hello', output: 'refused', background: 'refusal' },
      { input: 'monitor ask now', output: 'suggestion', background: 'monitor' },
    ];

    for (const view of backgroundRepliesFor(tab)) expect(view).not.toHaveProperty('record');
  });

  it('excludes running and ordinary entries', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'ask pending', output: '', background: 'pending', running: true },
      { input: 'ask ordinary', output: 'ordinary' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([]);
  });

  it('keeps no line for input that starts with the former acp command word', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [{ input: 'acp hello', output: 'reply', background: 'former' }];

    expect(backgroundRepliesFor(tab)).toEqual([{ id: 'former', output: 'reply' }]);
  });

  it('projects the exact subagent input as a line, with or without a slash, in any case, with leading whitespace and before a hyphen', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'subagent --role research --task task.md', output: 'started', background: 'sub' },
      { input: '/subagent --role research --task task.md', output: 'started', background: 'sub-slash' },
      { input: '  /SuBaGeNt   --role research  ', output: 'started', background: 'sub-mixed' },
      { input: 'subagent-extra', output: 'reply', background: 'sub-hyphen' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'sub', output: 'started', line: 'subagent --role research --task task.md' },
      { id: 'sub-slash', output: 'started', line: '/subagent --role research --task task.md' },
      { id: 'sub-mixed', output: 'started', line: '  /SuBaGeNt   --role research  ' },
      { id: 'sub-hyphen', output: 'reply', line: 'subagent-extra' },
    ]);
  });

  it('keeps no line for a nested or longer token that only resembles subagent', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'monitor subagent --role research', output: 'reply', background: 'nested' },
      { input: 'subagents --role research', output: 'reply', background: 'longer' },
      { input: 'subagented', output: 'reply', background: 'suffixed' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'nested', output: 'reply' },
      { id: 'longer', output: 'reply' },
      { id: 'suffixed', output: 'reply' },
    ]);
  });

  it('projects a started subagent reply without a record and a completion with one', () => {
    const tab = makeTab('shell', '#fff');
    const backgroundRecord = { id: 'record-sub', name: 'subagent:research' };
    tab.log = [
      { input: 'subagent --role research --task task.md', output: 'Started', background: 'start-1' },
      {
        input: 'subagent --role research --task task.md', output: '## Answer',
        background: 'sub-1', backgroundRecord,
      },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'start-1', output: 'Started', line: 'subagent --role research --task task.md' },
      {
        id: 'sub-1', output: '## Answer', line: 'subagent --role research --task task.md',
        record: backgroundRecord,
      },
    ]);
  });
});

describe('pendingAcpReplyNamesFor delivered projections', () => {
  function pendingPrompt(overrides: Partial<AcpPendingPrompt> = {}): AcpPendingPrompt {
    return {
      finish: () => {}, abort: new AbortController(), prompt: 'hello', role: 'ask',
      roleName: 'ask', commands: [], runningEntries: new Set(), ...overrides,
    };
  }

  function withPrompts(states: Partial<Record<'ask' | 'tell', { prompt?: AcpPendingPrompt }>>) {
    const tab = makeTab('shell', '#fff');
    tab.runtime = { busy: false, context: [], queue: [], acpRoles: states };
    return tab;
  }

  it('projects id, name, role and echo for each role, preserving the supplied text and using prompt.role', () => {
    for (const { role, echo } of [
      { role: 'ask' as const, echo: 'ask ← subagent:research started' },
      { role: 'tell' as const, echo: 'tell ← subagent:research completed' },
    ]) {
      const tab = withPrompts({ [role]: { prompt: pendingPrompt({
        replyId: `reply-${role}`, role, roleName: 'configured-name',
        recordName: `acp:${role}:shell`, echo,
      }) } });
      expect(pendingAcpReplyNamesFor(tab)).toEqual([{
        id: `reply-${role}`, name: `acp:${role}:shell`, role, echo,
      }]);
    }
  });

  it('keeps an explicitly empty echo in the request and the projected view', () => {
    const tab = withPrompts({ ask: { prompt: pendingPrompt({
      replyId: 'reply-empty', role: 'ask', recordName: 'acp:ask:shell', echo: '',
    }) } });

    const view = pendingAcpReplyNamesFor(tab);
    expect(view).toEqual([{ id: 'reply-empty', name: 'acp:ask:shell', role: 'ask', echo: '' }]);
    expect(view[0]).toHaveProperty('echo', '');
    expect(tab.runtime?.acpRoles?.ask?.prompt?.echo).toBe('');
  });

  it('projects only id and name for a typed prompt, with no role or echo key', () => {
    const tab = withPrompts({ ask: { prompt: pendingPrompt({
      replyId: 'reply-typed', role: 'ask', recordName: 'acp:ask:shell',
    }) } });

    const view = pendingAcpReplyNamesFor(tab);
    expect(view).toEqual([{ id: 'reply-typed', name: 'acp:ask:shell' }]);
    expect(view[0]).not.toHaveProperty('role');
    expect(view[0]).not.toHaveProperty('echo');
  });

  it('projects nothing without a replyId even when an echo is supplied', () => {
    const tab = withPrompts({ ask: { prompt: pendingPrompt({
      recordName: 'acp:ask:shell', echo: 'ask ← subagent:research completed',
    }) } });

    expect(pendingAcpReplyNamesFor(tab)).toEqual([]);
  });

  it('projects nothing without a recordName, and stays empty with no runtime or no prompt', () => {
    const noRecord = withPrompts({ ask: { prompt: pendingPrompt({
      replyId: 'reply-no-record', echo: 'ask ← subagent:research completed',
    }) } });

    expect(pendingAcpReplyNamesFor(noRecord)).toEqual([]);
    expect(pendingAcpReplyNamesFor(makeTab('shell', '#fff'))).toEqual([]);
    expect(pendingAcpReplyNamesFor(withPrompts({ ask: {} }))).toEqual([]);
  });
});
