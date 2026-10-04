import { describe, expect, it } from 'vitest';
import { markdownToAnsi } from './markdown-to-ansi';
import { visibleWidth } from './ansi-text';

const ESCAPE = String.fromCodePoint(0x1B);

// Spelled out as the escapes the terminal receives, so a case reads as what is on the wire.
function sgr(code: number): string {
  return `${ESCAPE}[${code}m`;
}

describe('markdownToAnsi', () => {
  it('leaves plain text plain, line breaks included', () => {
    expect(markdownToAnsi('first line\nsecond line')).toBe('first line\nsecond line');
  });

  it('renders emphasis, code and strikethrough as terminal styles rather than markup', () => {
    expect(markdownToAnsi('**bold** *em* `code` ~~gone~~')).toBe(
      `${sgr(1)}bold${sgr(22)} ${sgr(3)}em${sgr(23)} ${sgr(36)}code${sgr(39)} ${sgr(9)}gone${sgr(29)}`,
    );
  });

  it('renders headings in bold, underlining the top level', () => {
    expect(markdownToAnsi('# Title\n\n## Part')).toBe(
      `${sgr(4)}${sgr(1)}Title${sgr(22)}${sgr(24)}\n\n${sgr(1)}Part${sgr(22)}`,
    );
  });

  it('marks list items, numbering ordered ones from their start and nesting by indentation', () => {
    expect(markdownToAnsi('- one\n  - two\n- [x] done')).toBe('• one\n  • two\n• [x] done');
    expect(markdownToAnsi('3. three\n4. four')).toBe('3. three\n4. four');
  });

  it('lines a table up in columns under a bold header and a rule', () => {
    const lines = markdownToAnsi('| Command | What |\n|---|---|\n| `zsh` | shell |\n| q | quit |').split('\n');

    expect(lines[0]).toBe(`${sgr(1)}Command${sgr(22)}  ${sgr(1)}What${sgr(22)}`);
    expect(lines[1]).toBe(`${sgr(2)}${'─'.repeat(7)}  ${'─'.repeat(5)}${sgr(22)}`);
    expect(lines[2]).toBe(`${sgr(36)}zsh${sgr(39)}      shell`);
    expect(lines[3]).toBe('q        quit');
    expect(lines.slice(2).map((line) => visibleWidth(line))).toEqual([14, 13]);
  });

  it('indents code blocks and quotes, and draws a rule for a thematic break', () => {
    expect(markdownToAnsi('```\nls -la\n```')).toBe(`    ${sgr(36)}ls -la${sgr(39)}`);
    expect(markdownToAnsi('> quoted')).toBe(`${sgr(2)}│${sgr(22)} quoted`);
    expect(markdownToAnsi('---')).toBe(`${sgr(2)}${'─'.repeat(40)}${sgr(22)}`);
  });

  it('keeps a link target the text does not show, and shows characters rather than references', () => {
    expect(markdownToAnsi('[docs](https://example.com) A &amp; B')).toBe(
      `${sgr(4)}docs${sgr(24)} ${sgr(2)}(https://example.com)${sgr(22)} A & B`,
    );
  });

  it('renders nothing for no output', () => {
    expect(markdownToAnsi('')).toBe('');
  });
});
