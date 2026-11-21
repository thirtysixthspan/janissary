import { describe, expect, it } from 'vitest';
import { preserveJanissaryFences } from './janissary-fences';

const OPEN = String.raw`\`\`\`janissary`;
const CLOSE = String.raw`\`\`\``;
const TILDE_OPEN = String.raw`\~\~\~janissary`;
const TILDE_CLOSE = String.raw`\~\~\~`;

describe('preserveJanissaryFences', () => {
  it('escapes a single backtick janissary fence while leaving the command verbatim', () => {
    const text = ['Intro.', '```janissary', 'file grep janissary', '```', 'After.'].join('\n');
    expect(preserveJanissaryFences(text)).toBe(
      ['Intro.', OPEN, 'file grep janissary', CLOSE, 'After.'].join('\n'),
    );
  });

  it('escapes a tilde janissary fence', () => {
    const text = ['~~~janissary', 'file list config', '~~~'].join('\n');
    expect(preserveJanissaryFences(text)).toBe(
      [TILDE_OPEN, 'file list config', TILDE_CLOSE].join('\n'),
    );
  });

  it('escapes both delimiters of several janissary blocks in one reply', () => {
    const text = [
      '```janissary', 'file grep janissary', '```',
      'between',
      '```janissary', 'file list config', '```',
    ].join('\n');
    const out = preserveJanissaryFences(text).split('\n');
    expect(out.filter((line) => line === OPEN)).toHaveLength(2);
    expect(out.filter((line) => line === CLOSE)).toHaveLength(2);
    expect(out).toContain('file grep janissary');
    expect(out).toContain('file list config');
    expect(out).toContain('between');
  });

  it('leaves an ordinary fenced code block interleaved with a janissary block untouched', () => {
    const text = [
      '```js', 'const x = 1;', '```',
      '```janissary', 'file list config', '```',
    ].join('\n');
    expect(preserveJanissaryFences(text)).toBe(
      ['```js', 'const x = 1;', '```', OPEN, 'file list config', CLOSE].join('\n'),
    );
  });

  it('keeps an ordinary code fence containing a janissary-looking line untouched', () => {
    const text = ['```text', '```janissary', 'example', '```'].join('\n');
    expect(preserveJanissaryFences(text)).toBe(text);
  });

  it('leaves prose with markdown formatting around a block untouched', () => {
    const text = [
      '**Bold** and [a link](https://example.com).',
      '```janissary', 'notify hi', '```',
    ].join('\n');
    const out = preserveJanissaryFences(text);
    expect(out).toContain('**Bold** and [a link](https://example.com).');
    expect(out).toContain(OPEN);
    expect(out).toContain('notify hi');
  });

  it('escapes the opening delimiter of an unclosed janissary fence', () => {
    const text = ['```janissary', 'notify hi'].join('\n');
    expect(preserveJanissaryFences(text)).toBe([OPEN, 'notify hi'].join('\n'));
  });

  it('returns a reply with no janissary fence byte-for-byte unchanged', () => {
    const text = '# Heading\n\n**bold** and `code`\n\n```js\nconst x = 1;\n```\n';
    expect(preserveJanissaryFences(text)).toBe(text);
  });
});
