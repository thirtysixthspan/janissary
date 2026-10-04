import { describe, expect, it } from 'vitest';
import { formatDispatchedCommand } from './format-dispatched-command';

describe('formatDispatchedCommand', () => {
  it('renders the command and reply as terminal output followed by a fresh prompt', () => {
    expect(formatDispatchedCommand('help', 'first line\nsecond line\n'))
      .toBe('\r\u{1B}[2K> help\r\nfirst line\r\nsecond line\r\n> ');
  });

  it('shows a command with no reply without submitting it', () => {
    expect(formatDispatchedCommand('close other', ''))
      .toBe('\r\u{1B}[2K> close other\r\n\r\n> ');
  });
});
