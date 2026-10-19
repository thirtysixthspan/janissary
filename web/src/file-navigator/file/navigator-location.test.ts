import { describe, it, expect } from 'vitest';
import { locationTooltip, nextLocation } from './navigator-location';

describe('nextLocation', () => {
  it('cycles left → center → right → left', () => {
    expect(nextLocation('left')).toBeNull();
    expect(nextLocation(undefined)).toBe('right');
    expect(nextLocation('right')).toBe('left');
  });
});

describe('locationTooltip', () => {
  it('names each destination', () => {
    expect(locationTooltip('left')).toBe('Move to left sidebar');
    expect(locationTooltip(null)).toBe('Move to center tab strip');
    expect(locationTooltip('right')).toBe('Move to right sidebar');
  });
});
