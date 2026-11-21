import { describe, expect, it } from 'vitest';
import { isNotifyCommandLine, NOTIFY_PRIMER } from './primer.js';

describe('NOTIFY_PRIMER', () => {
  it('teaches the one-line grammar, the fenced example and the no-trailing-command rule', () => {
    expect(NOTIFY_PRIMER).toBe([
      'You can push a message into the user\'s notifications feed with the notify command.',
      'Write it as one line: notify <message>',
      'The message lands in the feed attributed to this tab, even when the feed is not on screen. To notify the user, put exactly one notify command inside a final fenced block whose info string is exactly `janissary`, without a `janissary` prefix; prose may follow the block. When the task is done, reply with the final answer and NO trailing command.',
      'Example:',
      '```janissary',
      'notify Build complete',
      '```',
    ].join('\n'));
    expect(NOTIFY_PRIMER).toContain('```janissary\nnotify Build complete\n```');
  });
});

describe('isNotifyCommandLine', () => {
  it.each([
    'notify',
    'notify Build finished',
    '  notify   spaced out',
    'NOTIFY Hello',
    'NoTiFy Mixed',
  ])('accepts %j', (line) => {
    expect(isNotifyCommandLine(line)).toBe(true);
  });

  it.each([
    'notifies Build finished',
    'notify-x Build',
    '/notify Build finished',
    'question ask x',
    'notifyBuild',
    '',
  ])('rejects %j', (line) => {
    expect(isNotifyCommandLine(line)).toBe(false);
  });
});
