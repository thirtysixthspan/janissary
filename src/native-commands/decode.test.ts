import { describe, expect, it } from 'vitest';
import { decodeCommandSettings } from './decode.js';

function decode(text: string): ReturnType<typeof decodeCommandSettings> {
  return decodeCommandSettings(JSON.parse(text), text);
}

const ENABLED = { enabled: true, agentAccess: true };

describe('decodeCommandSettings key scanner', () => {
  it('reads keys containing escaped quotes and backslashes', () => {
    const decoded = decode(String.raw`{ "a\"b": { "enabled": false }, "c\\": { "agentAccess": false }, "d": {} }`);
    expect(decoded?.values).toEqual({
      'a"b': { enabled: false, agentAccess: true },
      'c\\': { enabled: true, agentAccess: false },
      d: ENABLED,
    });
    expect(decoded?.malformed).toBe(false);
  });

  it('ignores structural characters inside key strings', () => {
    const decoded = decode('{ "a{b}[c],d": { "enabled": false }, "next": { "enabled": false } }');
    expect(decoded?.values).toEqual({
      'a{b}[c],d': { enabled: false, agentAccess: true },
      next: { enabled: false, agentAccess: true },
    });
    expect(decoded?.malformed).toBe(false);
  });

  it('ignores structural characters inside string values', () => {
    const decoded = decode(String.raw`{ "a": { "note": "}],{[\",", "enabled": false }, "b": { "enabled": false } }`);
    expect(decoded?.values).toEqual({
      a: { enabled: false, agentAccess: true },
      b: { enabled: false, agentAccess: true },
    });
    expect(decoded?.malformed).toBe(false);
  });

  it('flags a string value at depth one as malformed and defaults it to enabled', () => {
    const decoded = decode(String.raw`{ "a": "x, \"y\"", "b": { "enabled": false } }`);
    expect(decoded?.values).toEqual({ a: ENABLED, b: { enabled: false, agentAccess: true } });
    expect(decoded?.malformed).toBe(true);
  });

  it('tracks keys across nested objects and arrays', () => {
    const decoded = decode('{ "a": { "x": { "y": [1, { "z": 2 }, [3, 4]] }, "enabled": false }, "b": [1, 2], "c": {} }');
    expect(Object.keys(decoded?.values ?? {})).toEqual(['a', 'b', 'c']);
    expect(decoded?.values.a).toEqual({ enabled: false, agentAccess: true });
    expect(decoded?.values.b).toEqual(ENABLED);
    expect(decoded?.malformed).toBe(true);
  });

  it('lets the last of exact duplicate keys win', () => {
    const decoded = decode('{ "a": { "enabled": false }, "a": { "agentAccess": false } }');
    expect(decoded?.values).toEqual({ a: { enabled: true, agentAccess: false } });
    expect(decoded?.malformed).toBe(false);
  });

  it('lets the textual-last entry win when keys collide after normalization, in both orders', () => {
    const first = decode('{ "  A  B ": { "enabled": false }, "a b": { "agentAccess": false } }');
    expect(first?.values).toEqual({ 'a b': { enabled: true, agentAccess: false } });
    const second = decode('{ "a b": { "agentAccess": false }, "  A  B ": { "enabled": false } }');
    expect(second?.values).toEqual({ 'a b': { enabled: false, agentAccess: true } });
  });

  it('treats an empty key as malformed without producing an entry', () => {
    const decoded = decode('{ "": { "enabled": false }, "  ": {}, "a": {} }');
    expect(decoded?.values).toEqual({ a: ENABLED });
    expect(decoded?.malformed).toBe(true);
  });

  it('returns undefined for non-object top-level values', () => {
    for (const text of ['[]', '[{"a": {}}]', '"text"', '1', 'null', 'true']) {
      expect(decode(text)).toBeUndefined();
    }
  });
});
