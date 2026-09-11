import { describe, expect, it } from 'vitest';
import { isLoadFailedPayload, isPdfLoadFailure, isPdfPayload } from './shared.js';

const payload = {
  name: 'paper.pdf', path: '/docs/paper.pdf', size: '1.2 MB', url: '/open/ref-1',
};

describe('pdf payload guard', () => {
  it('accepts a complete payload', () => {
    expect(isPdfPayload(payload)).toBe(true);
  });

  it('rejects a payload missing any field', () => {
    for (const field of Object.keys(payload)) {
      const incomplete: Record<string, unknown> = { ...payload };
      delete incomplete[field];
      expect(isPdfPayload(incomplete), field).toBe(false);
    }
  });

  it('rejects a payload whose fields are the wrong type', () => {
    for (const field of Object.keys(payload)) {
      expect(isPdfPayload({ ...payload, [field]: 7 }), field).toBe(false);
    }
  });

  it('rejects values that are not records at all', () => {
    for (const value of [null, undefined, 'paper.pdf', 12, [payload]]) {
      expect(isPdfPayload(value)).toBe(false);
    }
  });
});

describe('pdf failure guards', () => {
  it('accepts exactly the three failure kinds', () => {
    for (const reason of ['password-protected', 'unreadable', 'other']) {
      expect(isPdfLoadFailure(reason), reason).toBe(true);
      expect(isLoadFailedPayload({ reason }), reason).toBe(true);
    }
  });

  it('rejects a kind outside the closed set', () => {
    for (const reason of ['corrupt', '', 'PASSWORD-PROTECTED', 7, null]) {
      expect(isPdfLoadFailure(reason)).toBe(false);
      expect(isLoadFailedPayload({ reason })).toBe(false);
    }
  });

  it('rejects a failure payload with no reason at all', () => {
    expect(isLoadFailedPayload({})).toBe(false);
    expect(isLoadFailedPayload(null)).toBe(false);
    expect(isLoadFailedPayload('unreadable')).toBe(false);
  });
});
