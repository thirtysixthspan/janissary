import { describe, expect, it } from 'vitest';
import { stripTerminalControls } from './strip-terminal-controls';

describe('stripTerminalControls', () => {
  it('keeps printable text, newlines and tabs', () => {
    expect(stripTerminalControls('ls -la\n\techo "café" 🙂')).toBe('ls -la\n\techo "café" 🙂');
  });

  it('removes control sequences with their parameters', () => {
    expect(stripTerminalControls('a\u{1B}[6nb\u{1B}[201~c\u{1B}[1;31md')).toBe('abcd');
  });

  it('removes an OSC string ended by BEL or by a string terminator', () => {
    expect(stripTerminalControls('a\u{1B}]7;file:///tmp\u{7}b\u{1B}]0;title\u{1B}\\c')).toBe('abc');
  });

  it('removes device control strings and two-part escapes', () => {
    expect(stripTerminalControls('a\u{1B}P+q544e\u{1B}\\b\u{1B}(Bc\u{1B}7d')).toBe('abcd');
  });

  it('drops a lone escape and the rest of an unterminated string', () => {
    expect(stripTerminalControls('a\u{1B}')).toBe('a');
    expect(stripTerminalControls('a\u{1B}]52;c;secret')).toBe('a');
  });

  it('keeps the text after a sequence another escape cuts short', () => {
    expect(stripTerminalControls('a\u{1B}]7;x\u{1B}[6nb')).toBe('ab');
    expect(stripTerminalControls('a\u{1B}[12\nb')).toBe('a\nb');
  });

  it('removes C0 controls other than newline and tab, DEL, and C1 controls', () => {
    expect(stripTerminalControls('a\u{3}b\rc\u{0}d\u{7F}e\u{9B}6nf\u{9C}g')).toBe('abcde6nfg');
  });
});
