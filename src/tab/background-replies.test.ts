import { describe, expect, it } from 'vitest';
import { backgroundRepliesFor } from './background-replies.js';
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
});
