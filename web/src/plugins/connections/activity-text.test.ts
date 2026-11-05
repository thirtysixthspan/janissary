import { describe, expect, it } from 'vitest';
import { prettyJson } from './activity-text';

describe('prettyJson', () => {
  it('re-indents an object and an array with two spaces', () => {
    expect(prettyJson('{"a":1,"b":{"c":[true]}}')).toBe('{\n  "a": 1,\n  "b": {\n    "c": [\n      true\n    ]\n  }\n}');
    expect(prettyJson('[1,"two"]')).toBe('[\n  1,\n  "two"\n]');
  });

  it('pretty-prints JSON surrounded by whitespace', () => {
    expect(prettyJson('\n  {"a":1}  \n')).toBe('{\n  "a": 1\n}');
  });

  it.each([
    ['plain text', 'db query select 1'],
    ['a JSON string', '"text"'],
    ['a JSON number', '42'],
    ['malformed JSON', '{"a":'],
    ['text that only starts with a brace', '{not json} and more'],
  ])('leaves %s alone', (_name, text) => {
    expect(prettyJson(text)).toBeUndefined();
  });
});
