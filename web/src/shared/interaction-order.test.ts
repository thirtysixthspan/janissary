import { describe, expect, it } from 'vitest';
import { nextInteractionOrder } from './interaction-order';

describe('nextInteractionOrder', () => {
  it('hands out strictly increasing orders', () => {
    const first = nextInteractionOrder();
    const second = nextInteractionOrder();

    expect(second).toBeGreaterThan(first);
  });
});
