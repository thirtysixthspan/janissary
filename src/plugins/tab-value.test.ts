import { describe, expect, it } from 'vitest';
import { isJsonCompatible, validateTabValue } from './tab-value.js';
import type { TabPluginActivation } from './api.js';

// Everything a plugin produces — a tab payload, an intent result — is broadcast or replied to as
// JSON. Values JavaScript is happy with but JSON is not would be silently rewritten in transit, so
// the host refuses them at the boundary rather than letting a client receive something else.

describe('isJsonCompatible', () => {
  it('accepts the JSON value space, including nesting', () => {
    expect(isJsonCompatible(null)).toBe(true);
    expect(isJsonCompatible('text')).toBe(true);
    expect(isJsonCompatible(false)).toBe(true);
    expect(isJsonCompatible(0)).toBe(true);
    expect(isJsonCompatible([1, 'two', { three: [true, null] }])).toBe(true);
    expect(isJsonCompatible({ nested: { deeper: ['ok'] } })).toBe(true);
  });

  it('refuses numbers that JSON cannot round-trip', () => {
    expect(isJsonCompatible(NaN)).toBe(false);
    expect(isJsonCompatible(Infinity)).toBe(false);
    expect(isJsonCompatible({ size: NaN })).toBe(false);
    expect(isJsonCompatible([1, -Infinity])).toBe(false);
  });

  it('refuses values with no JSON representation at all', () => {
    expect(isJsonCompatible(undefined)).toBe(false);
    expect(isJsonCompatible(1n)).toBe(false);
    expect(isJsonCompatible(() => {})).toBe(false);
    expect(isJsonCompatible(Symbol('nope'))).toBe(false);
  });

  // Serializing one of these throws rather than producing wrong output, so the walk has to notice
  // the cycle itself instead of recursing until the stack runs out.
  it('refuses a cycle without recursing forever', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(isJsonCompatible(circular)).toBe(false);

    const viaArray: unknown[] = ['first'];
    viaArray.push(viaArray);
    expect(isJsonCompatible(viaArray)).toBe(false);
  });

  it('accepts the same value appearing twice without calling it a cycle', () => {
    const shared = { shared: true };
    expect(isJsonCompatible({ left: shared, right: shared })).toBe(true);
    expect(isJsonCompatible([shared, shared])).toBe(true);
  });
});

describe('validateTabValue', () => {
  const activation = { isPayload: () => true } as TabPluginActivation;

  it('refuses an empty title, which the tab strip would draw as nothing', () => {
    expect(() => validateTabValue(activation, { title: '  ', payload: {} })).toThrow('empty tab title');
  });

  it('leaves the title alone when there is none, because an update may omit it', () => {
    expect(() => validateTabValue(activation, { payload: {} })).not.toThrow();
  });

  it('refuses a payload the plugin own guard rejects', () => {
    expect(() => validateTabValue({ isPayload: () => false } as TabPluginActivation, { payload: {} }))
      .toThrow('invalid tab payload');
  });

  it('refuses a payload with a property whose value is undefined', () => {
    // No guard notices this one: the property is present and typed, and only the JSON walk sees that
    // sending it would drop the key on the floor.
    expect(() => validateTabValue(activation, { payload: { root: undefined } })).toThrow('invalid tab payload');
  });
});
