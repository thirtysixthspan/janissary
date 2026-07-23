import { describe, it, expect } from 'vitest';
import { formatContext } from './context.js';

describe('formatContext', () => {
  it('wraps a single entry in its role\'s begin/end markers', () => {
    const text = formatContext([{ role: 'input', text: 'hello' }]);
    expect(text).toBe('━━━━━━━━━━ SENT TO MODEL BEGIN ━━━━━━━━━━\nhello\n━━━━━━━━━━ SENT TO MODEL END ━━━━━━━━━━');
  });

  it('joins multiple entries with the right markers per role', () => {
    const text = formatContext([
      { role: 'input', text: 'prompt' },
      { role: 'response', text: 'reply' },
    ]);
    expect(text).toContain('SENT TO MODEL BEGIN');
    expect(text).toContain('prompt');
    expect(text).toContain('SENT TO MODEL END');
    expect(text).toContain('MODEL RESPONSE BEGIN');
    expect(text).toContain('reply');
    expect(text).toContain('MODEL RESPONSE END');
    expect(text.indexOf('SENT TO MODEL')).toBeLessThan(text.indexOf('MODEL RESPONSE'));
  });

  it('returns an empty string for no entries', () => {
    expect(formatContext([])).toBe('');
  });
});
