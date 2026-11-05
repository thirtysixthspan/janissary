import { describe, expect, it } from 'vitest';
import { relativeActivity } from './relative-activity';

describe('relativeActivity', () => {
  const NOW = 1_000_000_000;

  it.each([
    { elapsed: 0, text: 'just now' },
    { elapsed: 59_000, text: 'just now' },
    { elapsed: 3 * 60_000, text: '3m ago' },
    { elapsed: 2 * 60 * 60_000, text: '2h ago' },
    { elapsed: 3 * 24 * 60 * 60_000, text: '3d ago' },
  ])('renders $elapsed ms ago as $text', ({ elapsed, text }) => {
    expect(relativeActivity(NOW - elapsed, NOW)).toBe(text);
  });

  // A stamp from a clock that ran ahead reads as now rather than as a negative age.
  it('never reports a future stamp as negative', () => {
    expect(relativeActivity(NOW + 60_000, NOW)).toBe('just now');
  });
});
