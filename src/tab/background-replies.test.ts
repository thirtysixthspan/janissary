import { describe, expect, it } from 'vitest';
import { backgroundRepliesFor } from './background-replies.js';
import { makeTab } from './index.js';

describe('backgroundRepliesFor', () => {
  it('projects the exact ACP input as a line and leaves monitor replies without one', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: '/acp hello', output: 'answer', background: 'acp-lower' },
      { input: 'ACP summarize', output: 'answer', background: 'acp-upper' },
      { input: 'monitor ask now', output: 'suggestion', background: 'monitor' },
      { input: '', output: 'empty input', background: 'empty' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([
      { id: 'acp-lower', output: 'answer', line: '/acp hello' },
      { id: 'acp-upper', output: 'answer', line: 'ACP summarize' },
      { id: 'monitor', output: 'suggestion' },
      { id: 'empty', output: 'empty input' },
    ]);
  });

  it('excludes running and ordinary entries', () => {
    const tab = makeTab('shell', '#fff');
    tab.log = [
      { input: 'acp pending', output: '', background: 'pending', running: true },
      { input: 'acp ordinary', output: 'ordinary' },
    ];

    expect(backgroundRepliesFor(tab)).toEqual([]);
  });
});
