import { describe, expect, it } from 'vitest';
import { createFileTokenizer } from './file-tokenize';

function ranges(text: string, fileName: string, scope: string): string[] {
  return createFileTokenizer()(text, fileName)[0]
    .filter((token) => token.scope.includes(scope)).map((token) => text.slice(token.from, token.to));
}

describe.each(['a.js', 'a.ts'])('code operator scopes for %s', (fileName) => {
  it('highlights assignment, arithmetic, comparison, logical, and conditional symbols', () => {
    const text = 'const result = left + right >= 1 && ready ? 2 : 3;';
    expect(ranges(text, fileName, 'hljs-operator')).toEqual(['=', '+', '>=', '&&', '?', ':']);
    expect(ranges(text, fileName, 'hljs-keyword')).toContain('const');
    expect(ranges(text, fileName, 'hljs-number')).toEqual(['1', '2', '3']);
  });

  it('does not reinterpret operators inside strings, comments, or regular expressions', () => {
    const text = 'const text = "+ >= &&"; const pattern = /a+b*/; // += !==';
    expect(ranges(text, fileName, 'hljs-operator')).toEqual(['=', '=']);
    expect(ranges(text, fileName, 'hljs-string')).toContain('"+ >= &&"');
    expect(ranges(text, fileName, 'hljs-regexp')).toContain('/a+b*/');
    expect(ranges(text, fileName, 'hljs-comment')).toContain('// += !==');
  });

  it('keeps offsets aligned after Unicode text and existing identifier scopes', () => {
    const text = 'const text = "😀"; function compute() { return 1 + 2; }';
    expect(ranges(text, fileName, 'hljs-operator')).toEqual(['=', '+']);
    expect(ranges(text, fileName, 'hljs-string')).toContain('"😀"');
    expect(ranges(text, fileName, 'hljs-title')).toContain('compute');
  });
});

it.each(['a.json', 'a.md'])('preserves non-code language scopes for %s', (fileName) => {
  const text = fileName.endsWith('.json') ? '{"value": "+ >= &&"}' : '# + >= &&';
  expect(ranges(text, fileName, 'hljs-operator')).toEqual([]);
});
