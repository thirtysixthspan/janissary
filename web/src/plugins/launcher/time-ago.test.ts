import { describe, expect, it } from 'vitest';
import { relativeTime, timeAgoPrefix } from './time-ago';

const NOW = new Date('2026-06-01T12:00:00.000Z').getTime();
const ago = (milliseconds: number): number => NOW - milliseconds;

describe('relative time', () => {
  it('reads a minute-resolution timestamp in the coarsest unit that still says something', () => {
    expect(relativeTime(ago(4 * 60_000), NOW)).toBe('4m');
    expect(relativeTime(ago(3 * 60 * 60_000), NOW)).toBe('3h');
    expect(relativeTime(ago(2 * 24 * 60 * 60_000), NOW)).toBe('2d');
  });

  it('reads anything under a minute as now, and leaves a tab with nothing yet blank', () => {
    expect(relativeTime(ago(30_000), NOW)).toBe('now');
    expect(relativeTime(0, NOW)).toBe('');
    expect(relativeTime(-1, NOW)).toBe('');
  });

  // The host rounds a tab's activity down to the minute, which shifts the age shown by at most the 59
  // seconds the rounding dropped. A minute-resolution reading cannot show that, which is why the rail
  // can afford to publish a rounded number and still read honestly.
  it('reads a minute-rounded stamp within the minute the rounding dropped', () => {
    const trueAge = 5 * 60_000 + 40_000;
    const rounded = Math.floor(ago(trueAge) / 60_000) * 60_000;

    expect(['5m', '6m']).toContain(relativeTime(rounded, NOW));
  });

  it('never reads a negative age for a tab whose clock ran ahead', () => {
    expect(relativeTime(NOW + 60_000, NOW)).toBe('now');
  });

  it('gives the hover card a prefix that reads as a fact about the tab', () => {
    expect(timeAgoPrefix).toBe('active ');
  });
});
