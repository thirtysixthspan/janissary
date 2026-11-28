import { describe, expect, it } from 'vitest';
import { fitPanelPercent } from './panel-fit';

describe('fitPanelPercent', () => {
  it('returns the smallest percentage whose height fits the content', () => {
    expect(fitPanelPercent(1000, 1000, () => 250)).toBe(25);
  });

  it('caps at 90 when no percentage fits', () => {
    expect(fitPanelPercent(1000, 1000, () => 1000)).toBe(90);
  });

  it('finds the crossing for a monotone content-height function', () => {
    const contentHeightAtWidth = (width: number) => 90_000 / width;
    expect(fitPanelPercent(1000, 1000, contentHeightAtWidth)).toBe(30);
  });
});
