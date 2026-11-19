import { afterEach, describe, expect, it, vi } from 'vitest';
import { listPlacement, scrollBox } from './list-placement';
import type { PlacementRect } from './list-placement';

afterEach(() => {
  vi.restoreAllMocks();
});

const rect = (left: number, top: number, right: number, bottom: number): PlacementRect => ({
  top,
  left,
  right,
  bottom,
});

describe('listPlacement', () => {
  it('opens below while the list fits in the room below, including an exact fit', () => {
    const input = rect(0, 100, 200, 120);
    const box = rect(0, 0, 1000, 500);
    expect(listPlacement(input, box, 300).above).toBe(false);
    expect(listPlacement(input, box, 380).above).toBe(false);
  });

  it('opens above when the list is one pixel taller than the room below', () => {
    const input = rect(0, 100, 200, 120);
    const box = rect(0, 0, 1000, 500);
    expect(listPlacement(input, box, 381).above).toBe(true);
  });

  it('caps the width at the box right edge minus the input left edge', () => {
    const input = rect(40, 100, 200, 120);
    const box = rect(0, 0, 1000, 500);
    expect(listPlacement(input, box, 100).maxWidth).toBe(960);
  });
});

describe('scrollBox', () => {
  it('returns the client area of the nearest overflow-y ancestor', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const plain = document.createElement('div');
    const list = document.createElement('div');
    scroller.append(plain);
    plain.append(list);
    document.body.append(scroller);

    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 400));
    Object.defineProperties(scroller, {
      clientTop: { value: 2 },
      clientLeft: { value: 3 },
      clientWidth: { value: 250 },
      clientHeight: { value: 350 },
    });

    expect(scrollBox(list)).toEqual({ top: 22, left: 13, bottom: 372, right: 263 });
    scroller.remove();
  });

  it('returns the viewport when there is no overflow-y ancestor', () => {
    const list = document.createElement('div');
    document.body.append(list);

    expect(scrollBox(list)).toEqual({
      top: 0,
      left: 0,
      bottom: window.innerHeight,
      right: window.innerWidth,
    });
    list.remove();
  });
});
