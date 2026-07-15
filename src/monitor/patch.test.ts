import { describe, it, expect } from 'vitest';
import { createPatch } from './patch.js';

describe('createPatch', () => {
  it('emits every line prefixed with + for a pure addition', () => {
    const output = createPatch('file.txt', '', 'first\nsecond\n');
    expect(output).toContain('+first');
    expect(output).toContain('+second');
    expect(changeLines(output, '-')).toHaveLength(0);
  });

  it('mixes added, removed, and unchanged context lines for a multi-line change', () => {
    const oldStr = 'keep one\nremove this\nkeep two\nkeep three\n';
    const newStr = 'keep one\nkeep two\nadd this\nkeep three\n';
    const output = createPatch('file.txt', oldStr, newStr);
    expect(output).toContain('-remove this');
    expect(output).toContain('+add this');
    expect(output).toContain(' keep one');
    expect(output).toContain(' keep two');
    expect(output).toContain(' keep three');
  });

  it('produces no spurious extra or missing line when only one side has a trailing newline', () => {
    const withNewline = createPatch('file.txt', 'a\nb\n', 'a\nc\n');
    const withoutNewline = createPatch('file.txt', 'a\nb', 'a\nc');
    expect(withNewline).toContain('-b');
    expect(withNewline).toContain('+c');
    expect(withoutNewline).toContain('-b');
    expect(withoutNewline).toContain('+c');
    expect(changeLines(withNewline, '-')).toHaveLength(1);
    expect(changeLines(withNewline, '+')).toHaveLength(1);
    expect(changeLines(withoutNewline, '-')).toHaveLength(1);
    expect(changeLines(withoutNewline, '+')).toHaveLength(1);
  });
});

// Hunk body lines only, excluding the `---`/`+++` file-header lines which also start with - or +.
function changeLines(output: string, prefix: '-' | '+'): string[] {
  return output.split('\n').filter((line) => line.startsWith(prefix) && !line.startsWith(prefix.repeat(3)));
}
