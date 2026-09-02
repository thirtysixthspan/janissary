import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepCaretRowVisible, revealVerticalProbe } from './scroll';

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

// The caret's box as the helpers walk it through a reveal: each measurement takes the next rect and
// every measurement after the last one keeps reporting where the caret finished up.
function measuresInTurn(caret: HTMLElement, rects: DOMRect[]): void {
  let current = rects[0];
  vi.spyOn(caret, 'getBoundingClientRect').mockImplementation(() => {
    current = rects.shift() ?? current;
    return current;
  });
}

// Rows taller than the caret's box, as they are in the editor: `.editor-body` sets line-height 1.45
// while the caret is a zero-width inline span only as tall as the font's content box. jsdom reports
// `normal`, so without this every helper falls back to measuring in caret boxes.
function withRowHeight(height: number): void {
  vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({ lineHeight: `${height}px` } as CSSStyleDeclaration);
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

  it('scrolls down when the row below is painted only as a sliver at the bottom edge', () => {
    const { body, caret } = makeBodyAndCaret();
    // The probe point lands exactly on the body's bottom border: inside the box, but on the part of
    // the row below that the browser is only partly painting, where the hit test finds no row.
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 99, bottom: 113, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'down');
    expect(body.scrollTop).toBe(14);
    body.remove();
  });

  it('scrolls up when the row above is painted only as a sliver at the top edge', () => {
    const { body, caret } = makeBodyAndCaret();
    body.scrollTop = 50;
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 27, bottom: 41, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'up');
    expect(body.scrollTop).toBe(36);
    body.remove();
  });

  it('does not scroll when the probe point already clears the edge by half a caret box', () => {
    const { body, caret } = makeBodyAndCaret();
    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(makeRect({ top: 92, bottom: 106, left: 5, height: 14 }));
    revealVerticalProbe(body, caret, 'down');
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('brings a caret scrolled entirely out of view back before nudging', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    measuresInTurn(caret, [
      makeRect({ top: -60, bottom: -46, left: 5, height: 14 }),
      makeRect({ top: 106, bottom: 120, left: 5, height: 14 }),
    ]);
    revealVerticalProbe(body, caret, 'down');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(14);
    body.remove();
  });

  it('leaves scrollTop alone when bringing the caret back already reveals the probe point', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    measuresInTurn(caret, [
      makeRect({ top: -60, bottom: -46, left: 5, height: 14 }),
      makeRect({ top: 60, bottom: 74, left: 5, height: 14 }),
    ]);
    revealVerticalProbe(body, caret, 'down');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('nudges by a whole screen row rather than by the shorter caret box', () => {
    const { body, caret } = makeBodyAndCaret();
    withRowHeight(24);
    // The caret sits on the last row, which runs 101..125 — five pixels past the bottom edge. The
    // reveal pulls that row fully into view, then scrolls one row so the row below is painted whole.
    measuresInTurn(caret, [makeRect({ top: 106, bottom: 120, left: 5, height: 14 })]);
    revealVerticalProbe(body, caret, 'down');
    expect(body.scrollTop).toBe(29);
    body.remove();
  });

  it('scrolls down by the overhang when the caret box is inside the view but its row is not', () => {
    const { body, caret } = makeBodyAndCaret();
    withRowHeight(24);
    // The caret box ends two pixels above the bottom edge, so scrollIntoView finds nothing to do —
    // but the row it sits on runs three pixels past that edge, which is the line below the fold.
    measuresInTurn(caret, [makeRect({ top: 104, bottom: 118, left: 5, height: 14 })]);
    keepCaretRowVisible(body, caret);
    expect(body.scrollTop).toBe(3);
    body.remove();
  });

  it('scrolls up by the overhang when the caret row is clipped at the top edge', () => {
    const { body, caret } = makeBodyAndCaret();
    body.scrollTop = 50;
    withRowHeight(24);
    measuresInTurn(caret, [makeRect({ top: 23, bottom: 37, left: 5, height: 14 })]);
    keepCaretRowVisible(body, caret);
    expect(body.scrollTop).toBe(48);
    body.remove();
  });

  it('leaves the scroll position alone when the caret row is already fully in view', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    withRowHeight(24);
    measuresInTurn(caret, [makeRect({ top: 60, bottom: 74, left: 5, height: 14 })]);
    keepCaretRowVisible(body, caret);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(0);
    body.remove();
  });

  it('does nothing beyond the browser scroll when the caret has no real layout', () => {
    const { body, caret, scrollIntoView } = makeBodyAndCaret();
    keepCaretRowVisible(body, caret);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(body.scrollTop).toBe(0);
    body.remove();
  });
});
