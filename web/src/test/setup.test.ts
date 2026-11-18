import { describe, expect, it } from 'vitest';

describe('client test setup', () => {
  it('canvas getContext is stubbed to return null', () => {
    expect(document.createElement('canvas').getContext('2d')).toBeNull();
  });
});
