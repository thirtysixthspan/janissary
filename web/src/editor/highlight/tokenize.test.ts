import { describe, it, expect } from 'vitest';
import { hljs } from './hljs';
import { languageForFile } from './registry';
import { tokenizeDocument } from './tokenize';

const languageOf = (name: string) => {
  const language = languageForFile(name, hljs);
  if (!language) throw new Error(`no language for ${name}`);
  return language;
};

describe('tokenizeDocument', () => {
  it('produces per-line token ranges for javascript', () => {
    const tokens = tokenizeDocument('const x = 1;', languageOf('a.js'));
    expect(tokens).toHaveLength(1);
    const keyword = tokens[0].find((t) => t.scope === 'hljs-keyword');
    expect(keyword).toMatchObject({ from: 0, to: 5 });
  });

  it('produces per-line token ranges for typescript', () => {
    const tokens = tokenizeDocument('const x: number = 1;', languageOf('a.ts'));
    const keyword = tokens[0].find((t) => t.scope === 'hljs-keyword');
    expect(keyword).toMatchObject({ from: 0, to: 5 });
  });

  it('produces per-line token ranges for json', () => {
    const tokens = tokenizeDocument('{"a": 1}', languageOf('a.json'));
    const attr = tokens[0].find((t) => t.scope === 'hljs-attr');
    expect(attr).toBeDefined();
  });

  it('produces per-line token ranges for markdown', () => {
    const tokens = tokenizeDocument('# Title', languageOf('a.md'));
    const section = tokens[0].find((t) => t.scope.includes('hljs-section'));
    expect(section).toBeDefined();
  });

  it('splits a multi-line markdown fenced code block onto the right lines', () => {
    const text = '```js\nconst x = 1;\n```';
    const tokens = tokenizeDocument(text, languageOf('a.md'));
    expect(tokens).toHaveLength(3);
    expect(tokens[1].length).toBeGreaterThan(0);
  });

  it('splits a multi-line typescript block comment onto the right lines', () => {
    const text = '/*\n * comment\n */\nconst x = 1;';
    const tokens = tokenizeDocument(text, languageOf('a.ts'));
    expect(tokens).toHaveLength(4);
    expect(tokens[0].some((t) => t.scope === 'hljs-comment')).toBe(true);
    expect(tokens[1].some((t) => t.scope === 'hljs-comment')).toBe(true);
    expect(tokens[2].some((t) => t.scope === 'hljs-comment')).toBe(true);
  });

  it('splits a multi-line typescript template literal onto the right lines', () => {
    const text = 'const s = `a\nb`;';
    const tokens = tokenizeDocument(text, languageOf('a.ts'));
    expect(tokens).toHaveLength(2);
    expect(tokens[0].some((t) => t.scope.includes('hljs-string'))).toBe(true);
    expect(tokens[1].some((t) => t.scope.includes('hljs-string'))).toBe(true);
  });

  it('keeps column offsets aligned across entity-bearing source (<, &, quotes)', () => {
    const text = 'const s = "<a & \'b\'>";';
    const tokens = tokenizeDocument(text, languageOf('a.ts'));
    const str = tokens[0].find((t) => t.scope.includes('hljs-string'));
    expect(str).toBeDefined();
    expect(text.slice(str!.from, str!.to)).toBe('"<a & \'b\'>"');
  });

  it('returns identical array objects for unchanged lines across calls', () => {
    const language = languageOf('a.js');
    const first = tokenizeDocument('const x = 1;\nconst y = 2;', language);
    const second = tokenizeDocument('const x = 1;\nconst z = 2;', language);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });
});
