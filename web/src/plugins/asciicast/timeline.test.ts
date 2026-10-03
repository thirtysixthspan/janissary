import { describe, expect, it } from 'vitest';
import type { CastEvent } from './cast-stream';
import { durationOf, eventsUpTo, stepIndex } from './timeline';

const output = (time: number, data = 'x'): CastEvent => ({ code: 'o', time, data });

describe('durationOf', () => {
  it('is the moment the last recorded event happened', () => {
    const timeline = [output(0), output(1), output(601)];
    expect(durationOf(timeline)).toBe(601);
  });

  it('is zero for a recording with no events, rather than an error', () => {
    expect(durationOf([])).toBe(0);
  });
});

describe('eventsUpTo', () => {
  it('is everything at or before a time, which is what a terminal must be fed to show it', () => {
    const timeline = [output(0), output(1), output(2)];
    expect(eventsUpTo(timeline, 1)).toHaveLength(2);
    expect(eventsUpTo(timeline, 0.5)).toHaveLength(1);
    expect(eventsUpTo(timeline, 9)).toHaveLength(3);
  });
});

describe('stepIndex', () => {
  const timeline = [output(0), output(1), output(2), output(3)];

  it('moves one recorded event at a time, not one second', () => {
    expect(timeline[stepIndex(timeline, 0, 1)].time).toBe(1);
    expect(timeline[stepIndex(timeline, 1, -1)].time).toBe(0);
  });

  it('stays put at either end rather than running off it', () => {
    expect(stepIndex(timeline, 0, -1)).toBe(0);
    expect(stepIndex(timeline, 3, 1)).toBe(3);
  });

  it('answers zero for an empty timeline', () => {
    expect(stepIndex([], 0, 1)).toBe(0);
  });
});