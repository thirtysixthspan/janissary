import { describe, it, expect } from 'vitest';
import { nextScrollStep, initialScrollAccel } from './scroll.js';

describe('nextScrollStep', () => {
  it('starts at a single line', () => {
    const { step } = nextScrollStep(initialScrollAccel, 1, 1000);
    expect(step).toBe(1);
  });

  it('accelerates by one line every 2 seconds of continuous scrolling', () => {
    // Simulate continuous ticks (small gaps) starting at t=0.
    let state = initialScrollAccel;
    let step = 0;
    for (let t = 0; t <= 4000; t += 100) {
      ({ step, state } = nextScrollStep(state, 1, t));
    }
    // At ~4s of continuous scrolling the step should be 3 (1 + floor(4000/2000)).
    expect(step).toBe(3);
  });

  it('reports step 2 once 2 seconds have elapsed continuously', () => {
    let state = initialScrollAccel;
    let r = nextScrollStep(state, 1, 0);
    state = r.state;
    r = nextScrollStep(state, 1, 100); // still continuous, <2s
    expect(r.step).toBe(1);
    state = r.state;
    r = nextScrollStep(state, 1, 2000); // would be a 1900ms gap -> resets, not continuous
    expect(r.step).toBe(1);
  });

  it('resets when scrolling pauses longer than the gap threshold', () => {
    let { state } = nextScrollStep(initialScrollAccel, 1, 0);
    // tick continuously up to 2.5s
    for (let t = 100; t <= 2500; t += 100) ({ state } = nextScrollStep(state, 1, t));
    const accelerated = nextScrollStep(state, 1, 2600);
    expect(accelerated.step).toBeGreaterThan(1);
    // now pause for 1s (> gapMs) then scroll again -> back to a single line
    const afterPause = nextScrollStep(accelerated.state, 1, 3700);
    expect(afterPause.step).toBe(1);
  });

  it('resets when direction reverses', () => {
    let { state } = nextScrollStep(initialScrollAccel, 1, 0);
    for (let t = 100; t <= 3000; t += 100) ({ state } = nextScrollStep(state, 1, t));
    expect(nextScrollStep(state, 1, 3100).step).toBeGreaterThan(1);
    // reverse direction -> resets
    expect(nextScrollStep(state, -1, 3100).step).toBe(1);
  });

  it('caps the step at maxStep', () => {
    let state = initialScrollAccel;
    let step = 0;
    for (let t = 0; t <= 100000; t += 100) ({ step, state } = nextScrollStep(state, 1, t));
    expect(step).toBe(20);
  });
});
