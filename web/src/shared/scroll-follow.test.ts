import { describe, expect, it } from 'vitest';
import { isProgrammaticScroll, isWithinBottomFollowThreshold } from './scroll-follow';

describe('scroll-follow policy', () => {
  it('recognizes only scroll positions less than one pixel from the last written position', () => {
    expect(isProgrammaticScroll(100.99, 100)).toBe(true);
    expect(isProgrammaticScroll(101, 100)).toBe(false);
  });

  it('follows only when the viewport is strictly less than forty pixels from the bottom', () => {
    expect(isWithinBottomFollowThreshold(1000, 661, 300)).toBe(true);
    expect(isWithinBottomFollowThreshold(1000, 660, 300)).toBe(false);
  });
});
