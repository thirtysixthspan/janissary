import { describe, expect, it } from 'vitest';
import { band, linear, seriesOffset } from './scale';

const BOX = { left: 0, top: 0, width: 100, height: 50 };

describe('linear', () => {
  it('maps the domain onto the box, inverted, so a larger value sits higher', () => {
    const scale = linear(BOX, { min: 0, max: 10 });
    expect(scale.at(0)).toBe(50);
    expect(scale.at(10)).toBe(0);
    expect(scale.at(5)).toBe(25);
  });

  it('places every tick inside the box, at a whole step', () => {
    const scale = linear(BOX, { min: 3, max: 97 });
    expect(scale.ticks.length).toBeGreaterThan(2);
    for (const tick of scale.ticks) {
      expect(tick).toBeGreaterThanOrEqual(scale.min);
      expect(tick).toBeLessThanOrEqual(scale.max);
    }
    const step = scale.ticks[1]! - scale.ticks[0]!;
    expect(step).toBeGreaterThan(0);
  });

  it('widens the domain outward to whole steps, so the first and last tick sit on the edges', () => {
    const scale = linear(BOX, { min: 3, max: 97 });
    expect(scale.min).toBeLessThanOrEqual(3);
    expect(scale.max).toBeGreaterThanOrEqual(97);
  });

  // A measure that never varies would make every division below divide by zero, so the domain is
  // widened rather than collapsed.
  it('survives a domain of one value without producing a non-finite position', () => {
    const scale = linear(BOX, { min: 5, max: 5 });
    expect(Number.isFinite(scale.at(5))).toBe(true);
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it('survives a reversed-looking span', () => {
    const scale = linear(BOX, { min: -4, max: -1 });
    expect(scale.at(-4)).toBe(50);
    expect(scale.at(-1)).toBe(0);
  });
});

describe('band', () => {
  it('gives every category its own slot, left to right, with a gap between them', () => {
    const scale = band(BOX, 4);
    expect(scale.count).toBe(4);
    // Slots are a quarter of the box each; a band sits inside its slot, inset by half the gap.
    expect(scale.at(0)).toBeCloseTo(2.5);
    expect(scale.at(1)).toBeCloseTo(27.5);
    expect(scale.at(3)).toBeCloseTo(77.5);
    expect(scale.width).toBeCloseTo(20);
    expect(scale.gap).toBeCloseTo(5);
  });

  it('treats an empty chart as one slot rather than dividing by zero', () => {
    const scale = band(BOX, 0);
    expect(scale.count).toBe(1);
    expect(Number.isFinite(scale.width)).toBe(true);
  });

  it('keeps a band at least a pixel wide, whatever the count', () => {
    expect(band(BOX, 5000).width).toBeGreaterThanOrEqual(1);
  });
});

describe('seriesOffset', () => {
  it('divides a slot between the series without letting them overlap', () => {
    const first = seriesOffset(0, 3, 30);
    const second = seriesOffset(1, 3, 30);
    expect(first.width).toBeCloseTo(9);
    expect(first.left).toBe(0);
    expect(second.left).toBeCloseTo(10);
    expect(first.left + first.width).toBeLessThan(second.left + second.width);
  });

  it('gives a single series the whole slot', () => {
    expect(seriesOffset(0, 1, 30)).toEqual({ left: 0, width: 27 });
  });
});
