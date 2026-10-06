import { describe, expect, it } from 'vitest';
import { formatDispatchedCommand } from './format-dispatched-command';

describe('formatDispatchedCommand', () => {
  it('renders the command and reply as terminal output followed by a fresh prompt', () => {
    expect(formatDispatchedCommand('help', 'first line\nsecond line\n'))
      .toBe('\r\u{1B}[2K\u{1B}[1m> help\u{1B}[22m\r\nfirst line\r\nsecond line\r\n\u{1B}[1m>\u{1B}[22m ');
  });

  it('sets the echoed command line and the fresh prompt in bold and leaves the reply plain', () => {
    const written = formatDispatchedCommand('theme', 'Themes: dark');
    const [echo, reply, prompt] = written.split('\r\n');

    expect(echo.endsWith('\u{1B}[1m> theme\u{1B}[22m')).toBe(true);
    expect(reply).toBe('Themes: dark');
    expect(prompt).toBe('\u{1B}[1m>\u{1B}[22m ');
  });

  it('shows a command with no reply without submitting it', () => {
    expect(formatDispatchedCommand('close other', ''))
      .toBe('\r\u{1B}[2K\u{1B}[1m> close other\u{1B}[22m\r\n\r\n\u{1B}[1m>\u{1B}[22m ');
  });
});
