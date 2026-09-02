import { describe, it, expect, vi, afterEach } from 'vitest';
import { caretRowBox, probePoint, screenRowHeight, scrollport } from './screen-rows';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRect(overrides: Partial<DOMRect>): DOMRect {
  return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...overrides };
}

function makeBody(lineHeight?: string): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 120, height: 100 }));
  if (lineHeight) vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({ lineHeight } as CSSStyleDeclaration);
  return body;
}

describe('screenRowHeight', () => {
  it('reads the body computed line-height', () => {
    expect(screenRowHeight(makeBody('24px'), 14)).toBe(24);
  });

  it('falls back to the caret box when the computed line-height is not a length', () => {
    expect(screenRowHeight(makeBody('normal'), 14)).toBe(14);
  });

  it('falls back to the caret box in an environment without layout', () => {
    expect(screenRowHeight(makeBody(), 14)).toBe(14);
  });
});

describe('caretRowBox', () => {
  it('grows the caret box symmetrically to a full screen row', () => {
    const body = makeBody('24px');
    expect(caretRowBox(body, makeRect({ top: 50, bottom: 64, height: 14 }))).toEqual({ top: 45, bottom: 69 });
  });

  it('leaves the caret box alone when a row is no taller than it', () => {
    const body = makeBody('normal');
    expect(caretRowBox(body, makeRect({ top: 50, bottom: 64, height: 14 }))).toEqual({ top: 50, bottom: 64 });
  });
});

describe('scrollport', () => {
  it('is the body box when no horizontal scrollbar is painted', () => {
    expect(scrollport(makeBody())).toEqual({ top: 20, bottom: 120 });
  });

  it('excludes a horizontal scrollbar, which paints no rows', () => {
    const body = makeBody();
    Object.defineProperties(body, {
      offsetHeight: { value: 100, configurable: true },
      clientHeight: { value: 85, configurable: true },
    });
    expect(scrollport(body)).toEqual({ top: 20, bottom: 105 });
  });
});

describe('probePoint', () => {
  it('lands on the centre of the row below the caret', () => {
    const body = makeBody('24px');
    // The caret's row runs 45..69, so the row below runs 69..93 and its centre is 81.
    expect(probePoint(body, makeRect({ top: 50, bottom: 64, height: 14 }), 'down')).toBe(81);
  });

  it('lands on the centre of the row above the caret', () => {
    const body = makeBody('24px');
    expect(probePoint(body, makeRect({ top: 50, bottom: 64, height: 14 }), 'up')).toBe(33);
  });
});
