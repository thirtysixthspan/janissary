import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, fitScale, stepZoom } from './pdf-view-model';

describe('pdf zoom', () => {
  it('steps by ten percent in either direction', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.1);
    expect(stepZoom(1, -1)).toBeCloseTo(0.9);
    expect(stepZoom(1, 3)).toBeCloseTo(1.3);
  });

  it('saturates at both bounds rather than overshooting', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
  });

  it('keeps the scale on the ten-percent grid', () => {
    expect(clampZoom(1.234)).toBe(1.2);
    expect(clampZoom(1.27)).toBe(1.3);
  });
});

describe('pdf fit scale', () => {
  const stage = { width: 800, height: 600 };

  it('fits the whole page in single-page layout', () => {
    // A 600×900 page is taller than the stage, so its height decides the fit.
    expect(fitScale('single', { width: 600, height: 900 }, stage)).toBeCloseTo(600 / 900);
    // A 1600×400 page is wider than it is tall, so its width decides it instead.
    expect(fitScale('single', { width: 1600, height: 400 }, stage)).toBeCloseTo(0.5);
  });

  it('fits the width in continuous layout whatever the page height', () => {
    expect(fitScale('continuous', { width: 600, height: 900 }, stage)).toBeCloseTo(800 / 600);
    expect(fitScale('continuous', { width: 1600, height: 400 }, stage)).toBeCloseTo(0.5);
  });

  it('enlarges a page narrower than the stage and shrinks one wider than it', () => {
    expect(fitScale('continuous', { width: 400, height: 400 }, stage)).toBeGreaterThan(1);
    expect(fitScale('continuous', { width: 2400, height: 400 }, stage)).toBeLessThan(1);
  });

  it('answers 1 for a stage or a page that has not been measured', () => {
    expect(fitScale('single', { width: 600, height: 900 }, { width: 0, height: 0 })).toBe(1);
    expect(fitScale('single', { width: 0, height: 0 }, stage)).toBe(1);
    // A stage with a width but no measured height still has a width to fit against.
    expect(fitScale('single', { width: 400, height: 400 }, { width: 800, height: 0 })).toBeCloseTo(2);
  });
});
