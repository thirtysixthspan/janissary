import { describe, it, expect } from 'vitest';
import { hljs } from './hljs';
import { languageForFile } from './registry';
import { createTokenizer } from './tokenize';

const languageOf = (name: string) => {
  const language = languageForFile(name, hljs);
  if (!language) throw new Error(`no language for ${name}`);
  return language;
};

describe('createTokenizer', () => {
  it('produces per-line token ranges for javascript', () => {
    const tokens = createTokenizer()('const x = 1;', languageOf('a.js'));
    expect(tokens).toHaveLength(1);
    const keyword = tokens[0].find((t) => t.scope === 'hljs-keyword');
    expect(keyword).toMatchObject({ from: 0, to: 5 });
  });

  it('produces per-line token ranges for typescript', () => {
    const tokens = createTokenizer()('const x: number = 1;', languageOf('a.ts'));
    const keyword = tokens[0].find((t) => t.scope === 'hljs-keyword');
    expect(keyword).toMatchObject({ from: 0, to: 5 });
  });

  it('produces per-line token ranges for json', () => {
    const tokens = createTokenizer()('{"a": 1}', languageOf('a.json'));
    const attr = tokens[0].find((t) => t.scope === 'hljs-attr');
    expect(attr).toBeDefined();
  });

  it('produces per-line token ranges for markdown', () => {
    const tokens = createTokenizer()('# Title', languageOf('a.md'));
    const section = tokens[0].find((t) => t.scope.includes('hljs-section'));
    expect(section).toBeDefined();
  });

  it('splits a multi-line markdown fenced code block onto the right lines', () => {
    const text = '```js\nconst x = 1;\n```';
    const tokens = createTokenizer()(text, languageOf('a.md'));
    expect(tokens).toHaveLength(3);
    expect(tokens[1].length).toBeGreaterThan(0);
  });

  it('splits a multi-line typescript block comment onto the right lines', () => {
    const text = '/*\n * comment\n */\nconst x = 1;';
    const tokens = createTokenizer()(text, languageOf('a.ts'));
    expect(tokens).toHaveLength(4);
    expect(tokens[0].some((t) => t.scope === 'hljs-comment')).toBe(true);
    expect(tokens[1].some((t) => t.scope === 'hljs-comment')).toBe(true);
    expect(tokens[2].some((t) => t.scope === 'hljs-comment')).toBe(true);
  });

  it('splits a multi-line typescript template literal onto the right lines', () => {
    const text = 'const s = `a\nb`;';
    const tokens = createTokenizer()(text, languageOf('a.ts'));
    expect(tokens).toHaveLength(2);
    expect(tokens[0].some((t) => t.scope.includes('hljs-string'))).toBe(true);
    expect(tokens[1].some((t) => t.scope.includes('hljs-string'))).toBe(true);
  });

  it('keeps column offsets aligned across entity-bearing source (<, &, quotes)', () => {
    const text = 'const s = "<a & \'b\'>";';
    const tokens = createTokenizer()(text, languageOf('a.ts'));
    const str = tokens[0].find((t) => t.scope.includes('hljs-string'));
    expect(str).toBeDefined();
    expect(text.slice(str!.from, str!.to)).toBe('"<a & \'b\'>"');
  });

  it('returns identical array objects for unchanged lines across calls', () => {
    const language = languageOf('a.js');
    const tokenize = createTokenizer();
    const first = tokenize('const x = 1;\nconst y = 2;', language);
    const second = tokenize('const x = 1;\nconst z = 2;', language);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  it('drops the memo when the same tokenizer is handed a different language', () => {
    const tokenize = createTokenizer();
    const first = tokenize('const x = 1;', languageOf('a.js'));
    tokenize('const x = 1;', languageOf('a.ts'));
    const third = tokenize('const x = 1;', languageOf('a.js'));
    expect(third[0]).not.toBe(first[0]);
  });

  it('gives each tokenizer its own memo, so one editor tab cannot evict another\'s', () => {
    const language = languageOf('a.js');
    const first = createTokenizer();
    const second = createTokenizer();

    const before = first('const x = 1;\nconst y = 2;', language);
    // A second tab tokenizing a different document through its own tokenizer, as two open editor
    // tabs on the same language do on every keystroke.
    second('const a = 9;\nconst b = 8;', language);
    const after = first('const x = 1;\nconst z = 2;', language);

    expect(after[0]).toBe(before[0]);
  });
});
