import { describe, expect, it } from 'vitest';
import { orderedJsonKeys, serializeRoles } from './ordered-json.js';

describe('ordered role JSON', () => {
  it('keeps numeric and special keys in textual order while skipping nested values', () => {
    const text = String.raw`{"10":{"nested":[{"2":"}, \"ignored\""}]},"review":null,"2":[],"__proto__":{},"1":true}`;
    expect(orderedJsonKeys(text)).toEqual(['10', 'review', '2', '__proto__', '1']);
  });

  it('decodes escaped quotes, backslashes, and Unicode in top-level keys', () => {
    const text = String.raw`{"a\"b":{},"c\\d":{},"\u0032":{},"☃":{}}`;
    expect(orderedJsonKeys(text)).toEqual(['a"b', String.raw`c\d`, '2', '☃']);
  });

  it('keeps the first key position for repeated keys and accepts an empty object', () => {
    expect(orderedJsonKeys('{"10":{},"2":{},"10":null}')).toEqual(['10', '2']);
    expect(orderedJsonKeys('{}')).toEqual([]);
    expect(serializeRoles([])).toBe('{}\n');
  });

  it('serializes escaped names and values as valid independently keyed members', () => {
    const roles = ['10', '__proto__', 'a"b', String.raw`c\d`, '2'].map((name) => ({
      name, description: 'Quotes " and braces }, [ with newlines\n☃',
      entries: [{ harness: 'codex', model: 'a"b' }, { harness: 'codex', model: 'a"b' }],
    }));
    const text = serializeRoles(roles);
    expect(orderedJsonKeys(text)).toEqual(roles.map((role) => role.name));
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const { name, description, entries } of roles) {
      expect(Object.hasOwn(parsed, name)).toBe(true);
      expect(parsed[name]).toEqual({ description, entries });
    }
  });
});
