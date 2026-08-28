import { describe, it, expect, vi, afterEach } from 'vitest';
import { revealVerticalProbe } from './scroll';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRect(overrides: Partial<DOMRect>): DOMRect {
  return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...overrides };
}

// The body is the scrollport (top 20 / bottom 120 on screen), the caret a 14px-tall box inside it.
function makeBodyAndCaret(): { body: HTMLElement; caret: HTMLElement; scrollIntoView: ReturnType<typeof vi.fn> } {
  const body = document.createElement('div');
  const caret = document.createElement('span');
  body.append(caret);
  document.body.append(body);
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 120, height: 100 }));
  const scrollIntoView = vi.fn();
  caret.scrollIntoView = scrollIntoView;
  return { body, caret, scrollIntoView };
}

describe('revealVerticalProbe', () => {
  it('does nothing when the caret has no real layout (zero-height rect, e.g. jsdom)', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    revealVerticalProbe(body, caret, 'down');
    revealVerticalProbe(body, caret, 'up');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('does not scroll when the probe point already lies inside the visible body', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 60, bottom: 74, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'down');
    revealVerticalProbe(body, caret, 'up');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('scrolls down one screen row when the caret sits on the last visible row', () => {
    const { body, caret } = makeBodyAndCaret();
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 106, bottom: 120, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'down');
    expect(body.scrollTop).toBe(14);
    body.remove();
  });

  it('scrolls up one screen row when the caret sits on the first visible row', () => {
    const { body, caret } = makeBodyAndCaret();
    body.scrollTop = 50;
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 20, bottom: 34, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'up');
    expect(body.scrollTop).toBe(36);
    body.remove();
  });

  it('brings a caret scrolled entirely out of view back before nudging', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    const rects = [
      makeRect({ top: -60, bottom: -46, left: 5, height: 14 }),
      makeRect({ top: 106, bottom: 120, left: 5, height: 14 }),
    ];
    vi.spyOn(caret, 'getBoundingClientRect').mockImplementation(() => rects.shift() ?? rects[0]);
    revealVerticalProbe(body, caret, 'down');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(14);
    body.remove();
  });

  it('leaves scrollTop alone when bringing the caret back already reveals the probe point', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    const rects = [
      makeRect({ top: -60, bottom: -46, left: 5, height: 14 }),
      makeRect({ top: 60, bottom: 74, left: 5, height: 14 }),
    ];
    vi.spyOn(caret, 'getBoundingClientRect').mockImplementation(() => rects.shift() ?? rects[0]);
    revealVerticalProbe(body, caret, 'down');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(0);
    body.remove();
  });
});
