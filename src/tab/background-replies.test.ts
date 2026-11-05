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
